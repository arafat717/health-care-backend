import nodeMailer from "nodemailer";
import config from "../config";

// Create a transporter using SMTP
export const transporter = nodeMailer.createTransport({
  service: "gmail",
  auth: {
    user: config.smtp_user,
    pass: config.smtp_password,
  },
});
