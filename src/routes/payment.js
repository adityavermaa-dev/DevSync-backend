const express = require("express");
const { userAuth } = require("../middlewares/auth");
const instance = require("../integrations/razorpay");
const paymentRouter = express.Router();
const membershipType = require("../costants");
const Payment = require("../models/Payment");
const {validateWebhookSignature} = require("razorpay/dist/utils/razorpay-utils");
const User = require("../models/user");
const config = require("../config/index")
const AppError = require("../utils/AppError")

paymentRouter.post("/payment/create",userAuth,async(req,res,next) => {
    try {
        const {membershipType} = req.body;
        const {firstName,lastName,email} = req.user;

        const order = await instance.orders.create({
            amount : membershipType[membershipType],
            currency : "INR",
            receipt : "receipt#1",
            notes : {
                firstName,
                lastName,
                email,
                membershipType
            }
        });
        const Payment = new Payment({
            userId : req.user._id,
            orderId : order.id,
            status : order.status,
            amount : order.amount,
            currency : order.currency,
            receipt : order.receipt,
            notes : order.notes
        })

        const savedPayment = await Payment.save();

        res.json({...savedPayment.toJSON()},config.finance.razorpayKeyId)
    } catch (error) {
        next(error)
    }
})

paymentRouter.post("/payment/webhook",async(req,res,next) => {
    try {
        const webhookSignature = req.get("X-Razorpay-signature");

        const isWebhookValid = validateWebhookSignature(
            JSON.stringify(req.body),
            webhookSignature,
            config.finance.razorpayWebhookSecret
        );

        if(!isWebhookValid){
            return next(new AppError("Webhook signature is invalid", 400));
        }

        const paymentDetails = req.body.payload.payment.entity;

        const payment = await Payment.findOne(({orderId : paymentDetails.orderId}));
        payment.status = paymentDetails.status;

        await payment.save();

        const user = await User.findOne({_id : payment.userId});
        user.isPremium = true;
        await User.save();

        return res.status(200).json(({message:"Webhook received successfully"}));

    } catch (error) {
        next(error)
    }
})

paymentRouter.get("/premium/verify",async(req,res) => {
    const user = req.user.toJSON();
    if(user.isPremium){
        return res.json({isPremium : true});
    }
    return res.json({isPremium : false});
})

module.exports = paymentRouter;