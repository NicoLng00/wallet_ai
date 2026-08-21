import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createVenomAgentMcpServer } from './venomServer.js';

// Gemello di client.js: client MCP separato, connesso al server venom (tool set diverso) —
// singleton indipendente, mai condiviso con il client del sistema principale.
let clientPromise = null;

async function connectClient() {
  const server = createVenomAgentMcpServer();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'aurora-venom-supervisor', version: '0.1.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function getClient() {
  if (!clientPromise) clientPromise = connectClient();
  return clientPromise;
}

export async function callVenomAgentTool(name, args) {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const text = result.content?.[0]?.text || 'Errore sconosciuto dal tool MCP.';
    throw new Error(`Tool MCP venom "${name}" ha restituito un errore: ${text}`);
  }
  return result.structuredContent;
}
