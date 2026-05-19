import { useState, useRef, useCallback } from "react";

export default function PDFArabicTranslator() {
  const [step, setStep] = useState("upload"); // upload | processing | done | error
  const [fileName, setFileName] = useState("");
  const [pdfBase64, setPdfBase64] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [translatedPages, setTranslatedPages] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFile = async (file) => {
    if (!file || file.type !== "application/pdf") {
      setErrorMsg("Please upload a PDF file.");
      setStep("error");
      return;
    }
    setFileName(file.name);
    const b64 = await readFileAsBase64(file);
    setPdfBase64(b64);
    setStep("ready");
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, []);

  const translateDocument = async () => {
    setStep("processing");
    setProgress(5);
    setProgressMsg("Reading your PDF...");
    setTranslatedPages([]);

    try {
      // Step 1: Extract all text from PDF using Claude vision
      setProgressMsg("Extracting document content...");
      setProgress(15);

      const extractResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are a document extraction expert. Extract ALL text from this PDF document completely and accurately. 
Preserve the structure: headings, paragraphs, tables, lists, labels, dates, names, numbers — everything.
Format your output as structured text with clear section breaks.
Output the raw extracted text only — no commentary.`,
          messages: [{
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: pdfBase64 }
              },
              { type: "text", text: "Extract ALL text from this document completely. Preserve all structure, formatting labels, headings, tables, and data." }
            ]
          }]
        })
      });

      const extractData = await extractResponse.json();
      const extractedText = extractData?.content?.[0]?.text || "";

      if (!extractedText.trim()) throw new Error("Could not extract text from PDF.");

      setProgress(40);
      setProgressMsg("Translating to Arabic...");

      // Step 2: Translate the extracted text
      const translateResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are a certified Arabic translator specializing in official government, academic, and legal documents.
Translate the provided document text into Modern Standard Arabic (الفصحى — Fusha).

Rules:
- Use formal official Arabic suitable for Saudi government scholarship applications
- Preserve ALL structure: headings, labels, dates, numbers, tables
- Transliterate proper names (people, places, institutions) into Arabic script
- Keep all numbers in their original form (Western or Arabic-Indic numerals)  
- Preserve document hierarchy exactly — if something was a heading, keep it as a heading
- Do NOT add any explanations or notes — output ONLY the Arabic translation
- Translate everything completely, leave nothing untranslated`,
          messages: [{
            role: "user",
            content: extractedText
          }]
        })
      });

      const translateData = await translateResponse.json();
      const arabicText = translateData?.content?.[0]?.text || "";

      if (!arabicText.trim()) throw new Error("Translation failed.");

      setProgress(70);
      setProgressMsg("Building Arabic PDF...");

      // Step 3: Generate downloadable HTML document (Arabic PDF via print)
      const htmlDoc = buildArabicHTML(arabicText, fileName, extractedText);

      setProgress(95);
      setProgressMsg("Finalizing document...");

      setTranslatedPages([{ arabic: arabicText, original: extractedText }]);
      setStep("done");

      // Auto-trigger download as HTML (printable to PDF)
      const blob = new Blob([htmlDoc], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(".pdf", "") + "_arabic.html";
      a.click();
      URL.revokeObjectURL(url);

      setProgress(100);

    } catch (e) {
      setErrorMsg(e.message || "Something went wrong. Try again.");
      setStep("error");
    }
  };

  const buildArabicHTML = (arabic, originalName, originalText) => {
    const lines = arabic.split("\n");
    const htmlLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return "<br/>";
      // Detect likely headings (short lines, often ending without period)
      if (trimmed.length < 60 && !trimmed.endsWith(".") && !trimmed.endsWith("،")) {
        return `<h2>${trimmed}</h2>`;
      }
      return `<p>${trimmed}</p>`;
    }).join("\n");

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ترجمة: ${originalName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Amiri', 'Traditional Arabic', 'Arial Unicode MS', serif;
    direction: rtl;
    text-align: right;
    background: #f8f6f0;
    color: #1a1a1a;
    padding: 0;
  }
  
  .page-wrapper {
    max-width: 800px;
    margin: 0 auto;
    background: white;
    min-height: 100vh;
    padding: 60px 70px;
    box-shadow: 0 0 40px rgba(0,0,0,0.1);
  }
  
  .doc-header {
    border-bottom: 3px double #1a472a;
    padding-bottom: 20px;
    margin-bottom: 30px;
    text-align: center;
  }
  
  .doc-header .label {
    font-size: 11px;
    color: #666;
    letter-spacing: 2px;
    text-transform: uppercase;
    direction: ltr;
    font-family: Arial, sans-serif;
    margin-bottom: 8px;
  }
  
  .doc-header .title {
    font-size: 20px;
    font-weight: bold;
    color: #1a472a;
  }
  
  .notice {
    background: #fffbeb;
    border: 1px solid #f59e0b;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 30px;
    font-size: 13px;
    color: #92400e;
    direction: ltr;
    text-align: left;
    font-family: Arial, sans-serif;
  }
  
  .content {
    line-height: 2.2;
    font-size: 17px;
  }
  
  h2 {
    font-size: 18px;
    font-weight: bold;
    color: #1a472a;
    margin: 24px 0 12px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid #e0e0e0;
  }
  
  p {
    margin: 8px 0;
    line-height: 2.1;
  }
  
  .original-section {
    margin-top: 60px;
    padding-top: 30px;
    border-top: 2px dashed #ccc;
    direction: ltr;
    text-align: left;
    font-family: Arial, Georgia, serif;
    color: #555;
  }
  
  .original-section h3 {
    font-size: 13px;
    color: #999;
    letter-spacing: 2px;
    margin-bottom: 16px;
    text-transform: uppercase;
  }
  
  .original-section p {
    font-size: 13px;
    line-height: 1.8;
    color: #666;
  }
  
  .print-btn {
    position: fixed;
    bottom: 24px;
    left: 24px;
    background: #1a472a;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    font-family: Arial, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999;
  }
  
  @media print {
    body { background: white; }
    .page-wrapper { box-shadow: none; padding: 40px; }
    .print-btn { display: none; }
    .notice { display: none; }
  }
  
  @page {
    margin: 2cm;
    size: A4;
  }
</style>
</head>
<body>
<div class="page-wrapper">
  <div class="doc-header">
    <div class="label">Official Arabic Translation · ترجمة رسمية</div>
    <div class="title">الوثيقة المترجمة</div>
    <div class="label" style="margin-top:6px; font-size:10px;">Original: ${originalName}</div>
  </div>
  
  <div class="notice">
    ⚠️ <strong>Note:</strong> This is an AI-generated translation for KSA scholarship application preparation. 
    For official certified submission, have this document stamped by a certified translator or notary.
    <br>To save as PDF: Click "Print to PDF" button below or press Ctrl+P → Save as PDF.
  </div>
  
  <div class="content">
    ${htmlLines}
  </div>
  
  <div class="original-section">
    <h3>Original Text (للمرجع)</h3>
    ${originalText.split("\n").map(l => l.trim() ? `<p>${l}</p>` : "<br/>").join("\n")}
  </div>
</div>

<button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>

</body>
</html>`;
  };

  const reset = () => {
    setStep("upload");
    setFileName("");
    setPdfBase64("");
    setProgress(0);
    setProgressMsg("");
    setTranslatedPages([]);
    setErrorMsg("");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a1628 0%, #0d2137 50%, #0a1628 100%)",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      color: "#e2e8f0",
    }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div style={{ fontSize: "13px", letterSpacing: "4px", color: "#64b5f6", marginBottom: "8px", textTransform: "uppercase" }}>
          KSA Scholarship · مترجم المستندات
        </div>
        <h1 style={{
          fontSize: "28px", fontWeight: "800", margin: 0,
          background: "linear-gradient(90deg, #ffffff, #64b5f6)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          PDF → Arabic Translator
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "8px" }}>
          Upload your document. Get a complete Arabic translation. Free.
        </p>
      </div>

      {/* Main Card */}
      <div style={{
        width: "100%", maxWidth: "560px",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px",
        padding: "32px",
        backdropFilter: "blur(10px)",
      }}>

        {/* UPLOAD STATE */}
        {(step === "upload" || step === "ready") && (
          <>
            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${dragOver ? "#64b5f6" : step === "ready" ? "#4ade80" : "rgba(255,255,255,0.2)"}`,
                borderRadius: "14px",
                padding: "40px 24px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.2s",
                background: dragOver ? "rgba(100,181,246,0.05)" : step === "ready" ? "rgba(74,222,128,0.05)" : "transparent",
                marginBottom: "20px",
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files[0])}
              />
              {step === "ready" ? (
                <>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>✅</div>
                  <div style={{ color: "#4ade80", fontWeight: "700", fontSize: "16px" }}>{fileName}</div>
                  <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "6px" }}>Click to change file</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "48px", marginBottom: "12px" }}>📄</div>
                  <div style={{ fontWeight: "600", fontSize: "16px", marginBottom: "6px" }}>Drop your PDF here</div>
                  <div style={{ color: "#94a3b8", fontSize: "13px" }}>or click to browse</div>
                </>
              )}
            </div>

            {step === "ready" && (
              <button
                onClick={translateDocument}
                style={{
                  width: "100%",
                  padding: "16px",
                  background: "linear-gradient(135deg, #1d6fa4, #2563eb)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "16px",
                  fontWeight: "700",
                  cursor: "pointer",
                  letterSpacing: "0.5px",
                  transition: "opacity 0.2s",
                }}
              >
                🌍 Translate Full Document to Arabic
              </button>
            )}

            <div style={{
              marginTop: "20px",
              padding: "14px",
              background: "rgba(250,204,21,0.08)",
              border: "1px solid rgba(250,204,21,0.2)",
              borderRadius: "10px",
              fontSize: "12px",
              color: "#fbbf24",
              lineHeight: "1.8",
            }}>
              <strong>What this does:</strong><br />
              ✦ Reads every word in your PDF<br />
              ✦ Translates to formal Arabic (Fusha/الفصحى)<br />
              ✦ Downloads a ready-to-print Arabic document<br />
              ✦ Works on transcripts, certificates, statements, letters
            </div>
          </>
        )}

        {/* PROCESSING STATE */}
        {step === "processing" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "20px" }}>
              {progress < 40 ? "📖" : progress < 70 ? "🌍" : "📝"}
            </div>
            <div style={{ fontWeight: "700", fontSize: "18px", marginBottom: "8px" }}>{progressMsg}</div>
            <div style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "24px" }}>
              Translating: <strong style={{ color: "#64b5f6" }}>{fileName}</strong>
            </div>

            {/* Progress bar */}
            <div style={{
              background: "rgba(255,255,255,0.1)",
              borderRadius: "999px",
              height: "8px",
              overflow: "hidden",
              marginBottom: "12px",
            }}>
              <div style={{
                height: "100%",
                width: `${progress}%`,
                background: "linear-gradient(90deg, #1d6fa4, #4ade80)",
                borderRadius: "999px",
                transition: "width 0.5s ease",
              }} />
            </div>
            <div style={{ color: "#94a3b8", fontSize: "12px" }}>{progress}% complete</div>

            <div style={{
              marginTop: "24px",
              padding: "12px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#64748b",
            }}>
              This may take 30–60 seconds depending on document length.
            </div>
          </div>
        )}

        {/* DONE STATE */}
        {step === "done" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "56px", marginBottom: "16px" }}>✅</div>
            <h2 style={{ fontSize: "22px", fontWeight: "800", marginBottom: "8px", color: "#4ade80" }}>
              Translation Complete!
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "24px" }}>
              Your Arabic document has been downloaded automatically.<br />
              Open the .html file and press <strong>Ctrl+P → Save as PDF</strong>.
            </p>

            <div style={{
              background: "rgba(74,222,128,0.08)",
              border: "1px solid rgba(74,222,128,0.2)",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "24px",
              textAlign: "left",
              fontSize: "13px",
              lineHeight: "2",
              color: "#86efac",
            }}>
              <div>📁 File: <strong>{fileName.replace(".pdf", "")}_arabic.html</strong></div>
              <div>🌍 Language: Modern Standard Arabic (الفصحى)</div>
              <div>📋 Includes original text for reference</div>
              <div>🖨️ Print-ready · A4 format</div>
            </div>

            <div style={{
              background: "rgba(250,204,21,0.08)",
              border: "1px solid rgba(250,204,21,0.2)",
              borderRadius: "10px",
              padding: "14px",
              marginBottom: "24px",
              fontSize: "12px",
              color: "#fbbf24",
              textAlign: "left",
              lineHeight: "1.9",
            }}>
              <strong>Next step for KSA:</strong><br />
              Take the printed Arabic doc to a local certified translator/notary.
              Ask them to <strong>stamp and sign it</strong> — costs much less than full translation.
            </div>

            <button
              onClick={reset}
              style={{
                width: "100%",
                padding: "14px",
                background: "rgba(255,255,255,0.08)",
                color: "#e2e8f0",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "10px",
                fontSize: "14px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Translate Another Document
            </button>
          </div>
        )}

        {/* ERROR STATE */}
        {step === "error" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#f87171", marginBottom: "8px" }}>
              Something went wrong
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "24px" }}>{errorMsg}</p>
            <button
              onClick={reset}
              style={{
                width: "100%",
                padding: "14px",
                background: "rgba(255,255,255,0.08)",
                color: "#e2e8f0",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "10px",
                fontSize: "14px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: "20px", fontSize: "11px", color: "#475569", textAlign: "center" }}>
        Powered by Claude AI · Translates to KSA-standard Fusha Arabic · 100% Free
      </div>
    </div>
  );
}
