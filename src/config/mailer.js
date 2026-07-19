const emailjs = require("@emailjs/nodejs");

emailjs.init({
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY,
});

// Template is expected to expose {{to_email}}, {{to_name}} and {{otp_code}}
// variables — the same template already used for client-side EmailJS sends
// (see canvadeFrontend's Profile.jsx / EmailOtpVerifier.jsx).
const sendOtpMail = async ({ toEmail, toName, otpCode }) => {
  return emailjs.send(process.env.EMAILJS_SERVICE_ID, process.env.EMAILJS_TEMPLATE_ID, {
    to_email: toEmail,
    to_name: toName || "there",
    otp_code: otpCode,
  });
};

// Template is expected to expose {{name}}, {{time}} and {{message}}
// variables, with its "To Email" set to support@canvade.com in the
// EmailJS dashboard — set EMAILJS_CONTACT_TEMPLATE_ID before this can send.
const sendContactMail = async ({ name, message }) => {
  return emailjs.send(process.env.EMAILJS_SERVICE_ID, process.env.EMAILJS_CONTACT_TEMPLATE_ID, {
    name,
    time: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    message,
  });
};

module.exports = { sendOtpMail, sendContactMail };
