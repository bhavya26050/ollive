/* Smoke test for Ollive API using Node fetch. Run with: node scripts/smoke-test.js
   This script exercises: list conversations, create conversation, send message, fetch logs, ingest sample.
*/

const base = process.env.BASE_URL ?? 'http://localhost:3000';

async function run() {
  try {
    console.log('Base URL:', base);

    // List conversations
    let res = await fetch(`${base}/api/conversations`);
    console.log('/api/conversations', res.status);
    const overview = await res.json();
    console.log('Conversations:', (overview.conversations || []).length);

    // Create conversation
    res = await fetch(`${base}/api/conversations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    console.log('POST /api/conversations', res.status);
    const created = await res.json();
    const conversationId = created.conversation?.id;
    if (!conversationId) throw new Error('Failed to create conversation');
    console.log('Created conversation:', conversationId);

    // Send a message (mock provider expected)
    const msgBody = { content: 'schema design' };
    res = await fetch(`${base}/api/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(msgBody) });
    console.log(`POST /api/conversations/${conversationId}/messages`, res.status);
    const messageResponse = await res.json();
    console.log('Message response keys:', Object.keys(messageResponse));

    // Fetch logs for conversation
    res = await fetch(`${base}/api/logs?conversationId=${conversationId}`);
    console.log(`/api/logs?conversationId=${conversationId}`, res.status);
    const logs = await res.json();
    console.log('Logs count:', (logs.logs || []).length);

    // Ingest a direct sample payload
    const sample = {
      conversationId,
      messageId: null,
      sessionId: 'local-smoke-test',
      provider: 'mock',
      model: 'mock-model',
      status: 'success',
      requestStartedAt: new Date().toISOString(),
      requestEndedAt: new Date().toISOString(),
      latencyMs: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      inputPreview: 'hello',
      outputPreview: 'hi',
      metadata: { test: true },
    };

    res = await fetch(`${base}/api/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sample) });
    console.log('/api/ingest', res.status);
    console.log(await res.json());

    console.log('Smoke test finished successfully.');
  } catch (err) {
    console.error('Smoke test failed:', err);
    process.exitCode = 1;
  }
}

run();
