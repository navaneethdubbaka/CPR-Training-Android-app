import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { backendArduino, type RawSensorData, type ConnectionStatus } from "./arduino-serial";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: '/ws/arduino' });

  const broadcastToAll = (msg: object) => {
    const payload = JSON.stringify(msg);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  };

  backendArduino.onSensorData((data: RawSensorData) => {
    broadcastToAll({ type: 'sensor_data', data });
  });

  backendArduino.onStatusChange((status: ConnectionStatus, error?: string) => {
    broadcastToAll({ type: 'status', status, error });
  });

  backendArduino.onRawLine((line: string, timestamp: number) => {
    broadcastToAll({ type: 'serial_line', line, timestamp });
  });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');

    ws.send(JSON.stringify({
      type: 'init',
      status: backendArduino.getStatus(),
      config: backendArduino.getConfig(),
      lastData: backendArduino.getLastRawData(),
    }));

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'connect':
            const success = await backendArduino.connect();
            ws.send(JSON.stringify({ type: 'connect_result', success }));
            break;

          case 'disconnect':
            backendArduino.disconnect();
            break;

          case 'set_config':
            if (msg.config) {
              backendArduino.setConfig(msg.config);
              broadcastToAll({ type: 'config_updated', config: backendArduino.getConfig() });
            }
            break;

          case 'list_ports':
            const ports = await backendArduino.listPorts();
            ws.send(JSON.stringify({ type: 'ports_list', ports }));
            break;

          case 'send_command':
            if (msg.command) {
              const sent = await backendArduino.sendCommand(msg.command);
              ws.send(JSON.stringify({ type: 'command_result', success: sent }));
            }
            break;

          case 'get_serial_log':
            ws.send(JSON.stringify({ type: 'serial_log', log: backendArduino.getSerialLog() }));
            break;

          case 'clear_serial_log':
            backendArduino.clearSerialLog();
            broadcastToAll({ type: 'serial_log_cleared' });
            break;
        }
      } catch (err) {
        console.error('[WS] Error handling message:', err);
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
    });
  });

  app.get('/api/arduino/status', (_req, res) => {
    res.json({
      status: backendArduino.getStatus(),
      config: backendArduino.getConfig(),
      lastData: backendArduino.getLastRawData(),
    });
  });

  app.post('/api/arduino/connect', async (_req, res) => {
    const success = await backendArduino.connect();
    res.json({ success, status: backendArduino.getStatus() });
  });

  app.post('/api/arduino/disconnect', (_req, res) => {
    backendArduino.disconnect();
    res.json({ status: backendArduino.getStatus() });
  });

  app.post('/api/arduino/config', (req, res) => {
    const config = req.body;
    backendArduino.setConfig(config);
    res.json({ config: backendArduino.getConfig() });
  });

  app.get('/api/arduino/ports', async (_req, res) => {
    const ports = await backendArduino.listPorts();
    res.json({ ports });
  });

  return httpServer;
}
