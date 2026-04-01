const normalizeOrigin = (origin) => {
    if (!origin) return origin;

    try {
        const url = new URL(origin);
        return `${url.protocol}//${url.host}`;
    } catch {
        return origin.trim().replace(/\/$/, "");
    }
};

const isDevLocalOrigin = (origin) => {
    try {
        const url = new URL(origin);
        const host = url.hostname;

        return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            (host === "localhost" || host === "127.0.0.1" || host === "::1")
        );
    } catch {
        return false;
    }
};

const withWwwVariants = (origin) => {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) return [];

    try {
        const url = new URL(normalizedOrigin);
        const host = url.hostname;
        const hosts = new Set([host]);

        if (host.startsWith("www.")) {
            hosts.add(host.replace(/^www\./, ""));
        } else {
            hosts.add(`www.${host}`);
        }

        return Array.from(hosts).map((candidateHost) => `${url.protocol}//${candidateHost}${url.port ? `:${url.port}` : ""}`);
    } catch {
        return [normalizedOrigin];
    }
};

const parseConfiguredOrigins = (...values) => {
    const origins = values
        .flatMap((value) => String(value || "").split(","))
        .map((value) => value.trim())
        .filter(Boolean)
        .flatMap(withWwwVariants)
        .map(normalizeOrigin)
        .filter(Boolean);

    return Array.from(new Set(origins));
};

const getPrimaryUrl = (value) => {
    const [first] = String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

    return first ? first.replace(/\/$/, "") : "";
};

module.exports = {
    normalizeOrigin,
    isDevLocalOrigin,
    parseConfiguredOrigins,
    getPrimaryUrl,
};
