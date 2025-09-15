import * as nodemailer from 'nodemailer';

export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendLowWalletBalanceEmail(to: string, threshold: number, balance: number) {
    const mailOptions = {
      from: process.env.SMTP_FROM || 'no-reply@trippa.com',
      to,
      subject: 'Low Wallet Balance Alert',
      text: `Your wallet balance has gone below your set threshold of ${threshold}. Current balance: ${balance}. Please top up to continue using our services.`,
    };
    await this.transporter.sendMail(mailOptions);
  }
}
