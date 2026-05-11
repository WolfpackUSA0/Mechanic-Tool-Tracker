
import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { pdfBase64, recipients = [] } = req.body || {};
    if (!pdfBase64) return res.status(400).json({ error: "Missing pdfBase64" });

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(200).json({ ok: true, skipped: true, message: "Email not configured" });
    }

    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipients.length ? recipients.join(",") : (process.env.EMAIL_TO || process.env.EMAIL_USER),
      subject: "Tool Control Report",
      text: "Attached is the latest tool control report.",
      attachments: [{
        filename: "Tool_Control_Report.pdf",
        content: pdfBase64.split("base64,")[1],
        encoding: "base64"
      }]
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
