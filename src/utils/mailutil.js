const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const { Resend } = require("resend");

let resend = null;
const getResendClient = () => {
    if (resend) return resend;
    if (!process.env.RESEND_API_KEY) {
        throw new Error("Missing RESEND_API_KEY environment variable for Resend email delivery.");
    }
    resend = new Resend(process.env.RESEND_API_KEY);
    return resend;
};

let transporter = null;

const getResendFromAddress = () => {
    const fromAddress = process.env.RESEND_FROM_EMAIL || process.env.USER_EMAIL;
    if (!fromAddress) {
        throw new Error("Missing RESEND_FROM_EMAIL or USER_EMAIL environment variable for email sender address.");
    }
    return fromAddress;
};

const sendResendEmail = async ({
    to,
    subject,
    html,
    text,
    from,
    replyTo,
    cc,
    bcc,
    tags,
    attachments,
    idempotencyKey,
}) => {
    const fromAddress = from || getResendFromAddress();
    const message = {
        from: fromAddress,
        to,
        subject,
        html,
        text,
        replyTo,
        cc,
        bcc,
        tags,
        attachments,
        idempotencyKey,
    };

    const { data, error } = await getResendClient().emails.send(message);
    return { data, error };
};

const OAuth2 = google.auth.OAuth2;

let oauth2Client = null;

// Initialize OAuth2 client (singleton)
const initializeOAuth2Client = () => {
    if (oauth2Client) return oauth2Client;
    
    oauth2Client = new OAuth2(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.REFRESH_TOKEN,
    });

    return oauth2Client;
};

// Create transporter with automatic token refresh
const createTransporter = async () => {
    try {
        // If transporter already exists, return it (nodemailer handles token refresh internally)
        if (transporter) {
            return transporter;
        }

        const client = initializeOAuth2Client();

        transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                type: "OAuth2",
                user: process.env.REAL_EMAIL,
                clientId: process.env.CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
                refreshToken: process.env.REFRESH_TOKEN,
                // Optional: Add access token for immediate use
                accessToken: await getAccessToken(),
            },
            dkim: {
                domainName: process.env.DKIM_DOMAIN,
                keySelector: process.env.DKIM_SELECTOR,
                privateKey: process.env.DKIM_PRIVATE_KEY,
            },
        });

        return transporter;
    } catch (err) {
        console.error("Error creating transporter:", err);
        throw err;
    }
};

// Get fresh access token with automatic refresh
const getAccessToken = async () => {
    try {
        const client = initializeOAuth2Client();
        
        return new Promise((resolve, reject) => {
            client.getAccessToken((err, token) => {
                if (err) {
                    console.error("Error getting access token:", err);
                    reject(err);
                } else {
                    resolve(token);
                }
            });
        });
    } catch (err) {
        console.error("Error in getAccessToken:", err);
        throw err;
    }
};

// Verify connection (optional, for testing)
const verifyTransporter = async () => {
    try {
        const trans = await createTransporter();
        await trans.verify();
        console.log("✓ Email transporter verified and ready");
        return true;
    } catch (err) {
        console.error("✗ Email transporter verification failed:", err);
        return false;
    }
};

// Refresh token periodically (optional, but recommended for long-running servers)
const scheduleTokenRefresh = () => {
    // Refresh token every 45 minutes (before the 1-hour expiration)
    setInterval(async () => {
        try {
            console.log("[Email] Refreshing OAuth2 token...");
            await getAccessToken();
            console.log("[Email] OAuth2 token refreshed successfully");
        } catch (err) {
            console.error("[Email] Token refresh failed:", err);
        }
    }, 45 * 60 * 1000); // 45 minutes
};

module.exports = {
    createTransporter,
    getAccessToken,
    verifyTransporter,
    scheduleTokenRefresh,
    sendResendEmail,
}