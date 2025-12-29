import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { messages, query } = await req.json();

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenRouter API key not configured" },
        { status: 500 }
      );
    }

    const chatContext = messages
      .map((m: any) => {
        const sender = m.sender === "mine" ? "User" : "Partner";
        const content = m.text ? m.text : `[Shared File: ${m.file?.name || "unnamed"}]`;
        return `${sender}: ${content}`;
      })
      .join("\n");

    const prompt = `
      You are a ultra-minimalist chat bot. Summarize the following chat in ONE short sentence.
      
      CONVERSATION:
      ---
      ${chatContext}
      ---
      
      USER'S QUERY: "${query}"
      
      RULES:
      - Respond with ONLY one short sentence.
      - No bullet points, no headers, no bold text.
      - Example: "You greeted each other and shared a file."
      - If it's just greetings, say: "Just exchanged greetings."
      - Maximum 20 words.
    `;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Secure Chat App",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          {
            role: "system",
            content: "You are a ultra-minimalist assistant. You only provide one-sentence chat summaries."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1, // Even lower for maximum consistency
        max_tokens: 50,
      }),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("OpenRouter Error:", data.error);
      return NextResponse.json(
        { error: data.error.message || "AI processing failed" },
        { status: 500 }
      );
    }

    const aiText = data.choices[0].message.content;

    return NextResponse.json({ response: aiText });
  } catch (error: any) {
    console.error("AI API Error:", error);
    return NextResponse.json(
      { error: "Failed to process AI request" },
      { status: 500 }
    );
  }
}
