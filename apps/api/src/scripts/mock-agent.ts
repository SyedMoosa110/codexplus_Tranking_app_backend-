/**
 * Mock Agent Simulator for End-to-End Testing
 * Runs in Node.js to simulate a Windows Agent sending heartbeats, app usage, and idle events.
 */

import { randomUUID } from 'crypto';

const API_BASE = process.env.API_URL || 'http://localhost:4000/api/v1/agent';

async function runMockAgent() {
  console.log('🤖 Starting Mock Windows Agent Simulator...');
  const deviceUuid = randomUUID();

  // 1. Login
  console.log('Logging in as ali.khan@enterprise.local...');
  const loginRes = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ali.khan@enterprise.local',
      password: 'Employee@123456',
      deviceUuid,
      hostname: 'DESKTOP-SIMULATOR',
      osVersion: 'Microsoft Windows 11 Enterprise (10.0.22631)',
      agentVersion: '1.0.0-mock',
    }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }

  const { access, userName } = await loginRes.json();
  console.log(`✓ Logged in successfully as: ${userName}`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access}`,
  };

  // 2. Fetch Policy
  const policyRes = await fetch(`${API_BASE}/policy`, { headers: authHeaders });
  const policy = await policyRes.json();
  console.log('✓ Received Org Policy. Idle threshold:', policy.idleThresholdSec, 'seconds');

  // 3. Start Session
  const sessionRes = await fetch(`${API_BASE}/session/start`, {
    method: 'POST',
    headers: authHeaders,
  });
  const { sessionId } = await sessionRes.json();
  console.log(`✓ Active Work Session started: ${sessionId}`);

  // 4. Send Simulated Events Batch
  console.log('Generating realistic work activity events...');
  const now = Date.now();
  const events = [
    {
      id: randomUUID(),
      sessionId,
      type: 'APP_CHANGE',
      occurredAt: new Date(now - 120000).toISOString(),
      payload: { processName: 'code.exe', category: 'DEVELOPMENT' },
    },
    {
      id: randomUUID(),
      sessionId,
      type: 'APP_CHANGE',
      occurredAt: new Date(now - 60000).toISOString(),
      payload: { processName: 'chrome.exe', category: 'RESEARCH' },
    },
    {
      id: randomUUID(),
      sessionId,
      type: 'IDLE_START',
      occurredAt: new Date(now - 30000).toISOString(),
    },
    {
      id: randomUUID(),
      sessionId,
      type: 'IDLE_END',
      occurredAt: new Date(now - 10000).toISOString(),
    },
    {
      id: randomUUID(),
      sessionId,
      type: 'HEARTBEAT',
      occurredAt: new Date().toISOString(),
    },
  ];

  const batchRes = await fetch(`${API_BASE}/events/batch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      clientNow: new Date().toISOString(),
      events,
    }),
  });

  const batchResult = await batchRes.json();
  console.log('✓ Batch Events Synced:', batchResult);

  // 5. Lightweight Heartbeat Test
  const hbRes = await fetch(`${API_BASE}/heartbeat`, {
    method: 'POST',
    headers: authHeaders,
  });
  console.log('✓ Heartbeat Test Result:', await hbRes.json());

  console.log('\n🎉 Mock Agent test passed completely! Server is fully operational.\n');
}

runMockAgent().catch((err) => {
  console.error('Mock Agent Error:', err);
});
