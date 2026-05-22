/* Test Gemini provider end-to-end against the local app.
   Run with: node scripts/test-gemini.js
   Ensure the dev server is running and `.env` contains `GOOGLE_GENERATIVE_AI_API_KEY`.
*/
const base = process.env.BASE_URL ?? 'http://localhost:3000';

async function run() {
  try {
    console.log('Base URL:', base);

    // Create a gemini conversation
    let res = await fetch(`${base}/api/conversations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'gemini', model: 'gemini-2.5-flash' }) });
    if (!res.ok) throw new Error(`/api/conversations creation failed: ${res.status}`);
    const created = await res.json();
    const conversationId = created.conversation?.id;
    console.log('Created conversation:', conversationId);

    // Send a message using provider=gemini
    const msg = { content: 'Explain how AI works in a few words', provider: 'gemini', model: 'gemini-2.5-flash' };
    res = await fetch(`${base}/api/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(msg) });
    console.log('POST messages status:', res.status);
    const payload = await res.json();
    console.log('Response keys:', Object.keys(payload));
    console.log('Assistant message:', payload.assistantMessage?.content ?? payload.messages?.slice(-1)[0]?.content);
    console.log('Logs sample:', await (await fetch(`${base}/api/logs?conversationId=${conversationId}`)).json());

    console.log('Gemini test completed.');
  } catch (err) {
    console.error('Gemini test failed:', err);
    process.exitCode = 1;
  }
}

run();
