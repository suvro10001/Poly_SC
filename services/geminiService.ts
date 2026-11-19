
import { GoogleGenAI } from "@google/genai";
import { Requisition } from "../src/types";

// Professional email drafting service using Gemini API
export async function draftRequisitionEmail(req: Requisition): Promise<string> {
  // Always initialize GoogleGenAI with a configuration object right before the API call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const itemSummary = req.items.map(i => {
    const colors = [
      i.red ? `Red:${i.red}` : '',
      i.black ? `Black:${i.black}` : '',
      i.yellow ? `Yellow:${i.yellow}` : '',
      i.green ? `Green:${i.green}` : '',
      i.blue ? `Blue:${i.blue}` : ''
    ].filter(Boolean).join(', ');
    
    return `- ${i.description} | Total: ${i.quantity} ${colors ? `[${colors}]` : ''}`;
  }).join('\n');

  const prompt = `
    Draft a professional internal email for a Requisition Slip.
    
    Details:
    - Slip No: ${req.reqNo}
    - Destination: ${req.to}
    - Destination Mail: ${req.destinationMail}
    - Area/Showroom: ${req.areaShowroom}
    - Party: ${req.party}
    - Req Date: ${req.requisitionDate}
    - Expected Delivery: ${req.deliveryDate}
    - Marketing Person: ${req.marketingPerson}
    - Prepared By: ${req.creatorName}
    
    Items List:
    ${itemSummary}
    
    Status: ${req.status}
    
    Write a concise, business-standard email notification. Include a professional subject line at the top.
  `;

  try {
    // Correct usage: call ai.models.generateContent with both model name and prompt
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    // Access response.text as a property, not a method, following @google/genai guidelines.
    return response.text || "Notification for Requisition " + req.reqNo;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating email body.";
  }
}
