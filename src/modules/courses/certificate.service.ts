import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import puppeteer from "puppeteer";
import * as QRCode from "qrcode";

@Injectable()
export class CertificateService {

  async generate(data: any) {

    const templatePath = path.join(
      process.cwd(),
      "src/assets/certificate/template.svg"
    );

    let svg = fs.readFileSync(templatePath, "utf8");

    const qrSvg = await QRCode.toString(data.verifyUrl, {
      type: "svg",
      margin: 1,
      width: 240,
      color: {
        dark: "#ffffff",
        light: "#00000000"
      }
    });

    svg = svg
      .replace("{{STUDENT_NAME}}", data.studentName)
      .replace("{{COURSE_TITLE}}", data.courseTitle)
      .replace("{{LESSON_COUNT}}", String(data.lessonCount))
      .replace("{{COURSE_DIFFICULTY}}", data.difficulty)
      .replace("{{COURSE_TYPE}}", data.courseType)
      .replace("{{CERTIFICATE_ID}}", data.certificateId)
      .replace("{{COMPLETION_DATE}}", data.date)
      .replace("{{VERIFY_URL}}", data.verifyUrl)
      .replace("{{QR_CODE}}", qrSvg);

    const html = `
      <html>
        <body style="margin:0;background:black">
          ${svg}
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]
    });

    const page = await browser.newPage();
    console.log(data);

    await page.setContent(html);

    const pdf = await page.pdf({
      width: "3508px",
      height: "2480px",
      printBackground: true
    });

    await browser.close();

    return pdf;
  }
}