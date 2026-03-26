const cron = require("node-cron");
const mongoose = require("mongoose");
const { subDays, startOfDay, endOfDay, format } = require("date-fns");
const ConnectionRequest = require("../models/connectionRequest");
const sendEmail = require("../services/emailService");
const { escapeHtml, button } = require("../services/emailTemplates");
const config = require("../config/index");
const logger = require("./logger");

const CRON_TIMEZONE = process.env.CRON_TIMEZONE;

const CRON_EXPRESSION = "0 8 * * *"; 

const groupBy = (items, getKey) => {
	return items.reduce((acc, item) => {
		const key = getKey(item);
		if (!acc[key]) acc[key] = [];
		acc[key].push(item);
		return acc;
	}, {});
};

cron.schedule(
	CRON_EXPRESSION,
	async () => {
		try {
			if (mongoose.connection.readyState !== 1) {
				logger.warn("[cron] DB not connected; skipping daily request digest");
				return;
			}

			const yesterday = subDays(new Date(), 1);
			const start = startOfDay(yesterday);
			const end = endOfDay(yesterday);

			const requests = await ConnectionRequest.find({
				status: "interested",
				createdAt: { $gte: start, $lt: end },
			})
				.populate("fromUserId", "firstName lastName")
				.populate("toUserId", "firstName lastName email");

			if (!requests.length) return;

			const byRecipient = groupBy(
				requests.filter(r => r?.toUserId?.email),
				(r) => String(r.toUserId._id)
			);

			const dateLabel = format(yesterday, "do MMM yyyy");
			const appUrl = (config.general.frontendUrl || "").replace(/\/$/, "");
			const cta = appUrl ? button(appUrl, "Open DevSync") : "";

			for (const recipientId of Object.keys(byRecipient)) {
				const recipientRequests = byRecipient[recipientId];
				const recipient = recipientRequests[0].toUserId;
				const to = recipient.email;

				const listItems = recipientRequests
					.map((r) => {
						const from = r.fromUserId;
						const fromName = escapeHtml(
							[from?.firstName, from?.lastName].filter(Boolean).join(" ") || "Someone"
						);
						return `<li style="margin: 6px 0;">${fromName} sent you a connection request</li>`;
					})
					.join("");

				const count = recipientRequests.length;
				const subject = `You have ${count} new connection request${count === 1 ? "" : "s"} on DevSync`;

				const recipientName = escapeHtml(recipient.firstName || "there");

				const html = `
					<p style="margin: 0 0 12px;">Hi ${recipientName},</p>
					<p style="margin: 0 0 12px;">Here’s a summary of the connection requests you received on <b>${escapeHtml(dateLabel)}</b>:</p>
					<ul style="padding-left: 18px; margin: 0 0 12px;">${listItems}</ul>
					<p style="margin: 0 0 12px;">Please review and respond when you’re ready.</p>
					${cta}
					<p style="margin: 12px 0 0; color: #6b7280; font-size: 12px;">If the button doesn’t work, open: ${escapeHtml(appUrl || "DevSync")}</p>
				`;

				try {
					await sendEmail({
						to,
						subject,
						preheader: `You received ${count} new request${count === 1 ? "" : "s"} yesterday.`,
						html,
					});
				} catch (error) {
					logger.error("[cron] Failed to send digest", {
						to,
						error: error?.message || error,
					});
				}
			}
		} catch (error) {
			logger.error("[cron] Daily request digest failed", {
				error: error?.message || error,
			});
		}
	},
	CRON_TIMEZONE ? { timezone: CRON_TIMEZONE } : undefined
);



