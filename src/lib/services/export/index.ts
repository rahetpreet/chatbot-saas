import Papa from "papaparse";
import { jsPDF } from "jspdf";
import { formatDate } from "@/lib/utils";

export interface LeadExportRow {
  ID: string;
  Name: string;
  Email: string;
  Phone: string;
  Status: string;
  Score: number;
  Date: string;
  [key: string]: any;
}

export function generateLeadsCSV(leads: any[]): string {
  const formattedRows: LeadExportRow[] = leads.map((lead) => {
    let customFields = {};
    try {
      if (lead.collectedFields) {
        customFields = typeof lead.collectedFields === "string" ? JSON.parse(lead.collectedFields) : lead.collectedFields;
      }
    } catch {}

    return {
      ID: lead.id,
      Name: lead.name || "-",
      Email: lead.email || "-",
      Phone: lead.phone || "-",
      Status: lead.status || "NEW",
      Score: lead.score || 0,
      Date: formatDate(lead.createdAt),
      ...customFields,
    };
  });

  return Papa.unparse(formattedRows);
}

export function generateLeadsJSON(leads: any[]): string {
  return JSON.stringify(leads, null, 2);
}

export function generateConversationTranscriptPDF(conversation: any): Buffer {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(79, 70, 229); // Indigo brand
  doc.text("Chatbot SaaS - Conversation Transcript", 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Conversation ID: ${conversation.id}`, 14, 28);
  doc.text(`Status: ${conversation.sessionStatus}`, 14, 34);
  doc.text(`Started At: ${formatDate(conversation.startedAt)}`, 14, 40);
  if (conversation.closedAt) {
    doc.text(`Closed At: ${formatDate(conversation.closedAt)}`, 14, 46);
  }

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.line(14, 52, 196, 52);

  // Messages
  let y = 60;
  const messages = conversation.messages || [];

  doc.setFontSize(11);
  for (const msg of messages) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    const isBot = msg.senderType === "BOT" || msg.senderType === "AI";
    const sender = isBot ? "Bot" : msg.senderType === "AGENT" ? "Agent" : "Visitor";
    const time = formatDate(msg.timestamp);

    doc.setFont("helvetica", "bold");
    if (isBot) {
      doc.setTextColor(79, 70, 229);
    } else if (msg.senderType === "AGENT") {
      doc.setTextColor(16, 185, 129); // Green
    } else {
      doc.setTextColor(30, 41, 59); // Slate
    }

    doc.text(`${sender} (${time}):`, 14, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);

    const splitText = doc.splitTextToSize(msg.content || "[Media/Attachment]", 180);
    doc.text(splitText, 14, y);
    y += splitText.length * 6 + 4;

    if (msg.attachments) {
      try {
        const atts = typeof msg.attachments === "string" ? JSON.parse(msg.attachments) : msg.attachments;
        if (Array.isArray(atts) && atts.length > 0) {
          doc.setTextColor(100, 100, 100);
          doc.text(`[Attachments: ${atts.map((a: any) => a.name || a.url).join(", ")}]`, 14, y);
          y += 6;
        }
      } catch {}
    }
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
