const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const fs = require("fs");

const OAuth2 = google.auth.OAuth2;

const createTransporter = async () => {
    try {
        const oauth2Client = new OAuth2(
            process.env.CLIENT_ID,
            process.env.CLIENT_SECRET,
            "https://developers.google.com/oauthplayground"
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.REFRESH_TOKEN,
        });

        const accessToken = await new Promise((resolve, reject) => {
            oauth2Client.getAccessToken((err, token) => {
                if (err) {
                    console.log("*ERR: ", err)
                    reject();
                }
                resolve(token);
            });
        });

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                type: "OAuth2",
                user: process.env.REAL_EMAIL,
                accessToken,
                clientId: process.env.CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
                refreshToken: process.env.REFRESH_TOKEN,
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

module.exports = {
    createTransporter
}