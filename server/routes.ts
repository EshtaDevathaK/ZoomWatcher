import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import { generateMeetingCode } from "../shared/utils";
import { insertMeetingSchema, insertParticipantSchema, updateUserSettingsSchema } from "@shared/schema";

// Store WebSocket connections by meetingId and userId
interface WebSocketConnection {
  userId: number;
  socket: WebSocket;
  username: string;
  displayName: string;
}

interface WebSocketMessage {
  type: string;
  meetingId: number;
  from: {
    userId: number;
    username: string;
    displayName: string;
  };
  data: any;
}

// Map to store active connections by meeting
const meetingConnections = new Map<number, Map<number, WebSocketConnection>>();

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // User Settings Routes
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    const userSettings = await storage.getUserSettings(userId);
    if (!userSettings) {
      return res.status(404).json({ message: "User settings not found" });
    }

    res.json(userSettings);
  });

  app.put("/api/settings", isAuthenticated, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    try {
      const validatedData = updateUserSettingsSchema.parse(req.body);
      const updatedSettings = await storage.updateUserSettings(userId, validatedData);
      
      if (!updatedSettings) {
        return res.status(404).json({ message: "User settings not found" });
      }
      
      res.json(updatedSettings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Meeting Routes
  app.post("/api/meetings", isAuthenticated, async (req, res) => {
    const hostId = req.user?.id;
    if (!hostId) return res.status(401).json({ message: "User not authenticated" });

    try {
      // Generate a unique 6-digit meeting code
      let meetingCode;
      let existingMeeting;
      do {
        meetingCode = generateMeetingCode();
        existingMeeting = await storage.getMeetingByCode(meetingCode);
      } while (existingMeeting);

      const meetingData = {
        name: req.body.name,
        meetingCode,
        hostId
      };

      const validatedData = insertMeetingSchema.parse(meetingData);
      const meeting = await storage.createMeeting(validatedData);

      // Automatically add the host as a participant
      const participantData = {
        userId: hostId,
        meetingId: meeting.id
      };
      
      await storage.addParticipant(participantData);
      
      res.status(201).json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid meeting data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create meeting" });
    }
  });

  app.get("/api/meetings", isAuthenticated, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    try {
      const meetings = await storage.getMeetingsByUserId(userId);
      res.json(meetings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch meetings" });
    }
  });

  app.get("/api/meetings/:id", isAuthenticated, async (req, res) => {
    try {
      const meetingId = parseInt(req.params.id);
      if (isNaN(meetingId)) {
        return res.status(400).json({ message: "Invalid meeting ID" });
      }

      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      res.json(meeting);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch meeting" });
    }
  });

  app.post("/api/meetings/join", isAuthenticated, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    try {
      const { meetingCode } = req.body;
      if (!meetingCode) {
        return res.status(400).json({ message: "Meeting code is required" });
      }

      const meeting = await storage.getMeetingByCode(meetingCode);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      if (!meeting.isActive) {
        return res.status(400).json({ message: "Meeting is not active" });
      }

      // Add user as participant if not already in the meeting
      const participants = await storage.getParticipantsByMeetingId(meeting.id);
      const isAlreadyParticipant = participants.some(
        p => p.userId === userId && !p.leftAt
      );

      if (!isAlreadyParticipant) {
        const participantData = {
          userId,
          meetingId: meeting.id
        };
        
        const validatedData = insertParticipantSchema.parse(participantData);
        await storage.addParticipant(validatedData);
      }

      res.json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid join data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to join meeting" });
    }
  });

  app.post("/api/meetings/:id/end", isAuthenticated, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    try {
      const meetingId = parseInt(req.params.id);
      if (isNaN(meetingId)) {
        return res.status(400).json({ message: "Invalid meeting ID" });
      }

      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      // Only host can end the meeting
      if (meeting.hostId !== userId) {
        return res.status(403).json({ message: "Only the host can end the meeting" });
      }

      const success = await storage.endMeeting(meetingId);
      if (success) {
        res.json({ message: "Meeting ended successfully" });
      } else {
        res.status(500).json({ message: "Failed to end meeting" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to end meeting" });
    }
  });

  app.post("/api/meetings/:id/leave", isAuthenticated, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    try {
      const meetingId = parseInt(req.params.id);
      if (isNaN(meetingId)) {
        return res.status(400).json({ message: "Invalid meeting ID" });
      }

      const success = await storage.removeParticipant(userId, meetingId);
      if (success) {
        res.json({ message: "Left meeting successfully" });
      } else {
        res.status(404).json({ message: "Not a participant or already left" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to leave meeting" });
    }
  });

  app.get("/api/meetings/:id/participants", isAuthenticated, async (req, res) => {
    try {
      const meetingId = parseInt(req.params.id);
      if (isNaN(meetingId)) {
        return res.status(400).json({ message: "Invalid meeting ID" });
      }

      const meeting = await storage.getMeeting(meetingId);
      if (!meeting) {
        return res.status(404).json({ message: "Meeting not found" });
      }

      const participants = await storage.getParticipantsByMeetingId(meetingId);
      
      // Get user details for each participant
      const participantsWithDetails = await Promise.all(
        participants
          .filter(p => !p.leftAt) // Only include active participants
          .map(async p => {
            const user = await storage.getUser(p.userId);
            return {
              ...p,
              user: user ? {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email
              } : null
            };
          })
      );

      res.json(participantsWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  const httpServer = createServer(app);
  
  // Setup WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Set up heartbeat to keep connections alive
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.ping();
        } catch (err) {
          console.error('Error sending ping:', err);
        }
      }
    });
  }, 30000); // every 30 seconds
  
  // Clean up interval on server close
  httpServer.on('close', () => {
    clearInterval(heartbeatInterval);
  });
  
  wss.on('connection', (ws) => {
    let userId: number | null = null;
    let meetingId: number | null = null;
    let userInfo: { username: string, displayName: string } | null = null;
    
    console.log('New WebSocket connection established');
    
    // Set up pong handler to respond to pings
    ws.on('pong', () => {
      // Connection is alive, nothing to do
    });
    
    ws.on('message', async (message) => {
      try {
        const parsedMessage = JSON.parse(message.toString()) as WebSocketMessage;
        console.log(`WebSocket message received: ${parsedMessage.type}`);
        
        // Handle different message types
        switch (parsedMessage.type) {
          case 'join-meeting':
            // User is joining a meeting room
            userId = parsedMessage.from.userId;
            meetingId = parsedMessage.meetingId;
            userInfo = {
              username: parsedMessage.from.username,
              displayName: parsedMessage.from.displayName
            };
            
            console.log(`User ${userInfo.displayName} (${userId}) joined meeting ${meetingId}`);
            
            // Initialize connections map for this meeting if it doesn't exist
            if (!meetingConnections.has(meetingId)) {
              meetingConnections.set(meetingId, new Map<number, WebSocketConnection>());
            }
            
            // Add this connection to the meeting
            const connectionsMap = meetingConnections.get(meetingId)!;
            connectionsMap.set(userId, {
              userId,
              socket: ws,
              username: userInfo.username,
              displayName: userInfo.displayName
            });
            
            // Notify other participants that this user has joined
            connectionsMap.forEach((conn, connUserId) => {
              if (connUserId !== userId && conn.socket.readyState === WebSocket.OPEN) {
                conn.socket.send(JSON.stringify({
                  type: 'user-joined',
                  meetingId,
                  from: parsedMessage.from
                }));
              }
            });
            
            // Send list of all current participants to the newly joined user
            const participants: any[] = [];
            connectionsMap.forEach((conn, connUserId) => {
              if (connUserId !== userId) {
                participants.push({
                  userId: connUserId,
                  username: conn.username,
                  displayName: conn.displayName
                });
              }
            });
            
            ws.send(JSON.stringify({
              type: 'participants-list',
              meetingId,
              data: { participants }
            }));
            break;
            
          case 'offer':
          case 'answer':
          case 'ice-candidate':
            // Forward WebRTC signaling messages to the intended recipient
            if (meetingId && userId) {
              const connectionsMap = meetingConnections.get(meetingId);
              
              if (connectionsMap) {
                const targetUserId = parsedMessage.data.targetUserId;
                const targetConn = connectionsMap.get(targetUserId);
                
                if (targetConn && targetConn.socket.readyState === WebSocket.OPEN) {
                  console.log(`Forwarding ${parsedMessage.type} from ${userId} to ${targetUserId}`);
                  targetConn.socket.send(JSON.stringify(parsedMessage));
                }
              }
            }
            break;
            
          case 'media-state-change':
            // Broadcast media state changes (mute/unmute, video on/off)
            if (meetingId && userId) {
              const connectionsMap = meetingConnections.get(meetingId);
              
              if (connectionsMap) {
                connectionsMap.forEach((conn, connUserId) => {
                  if (connUserId !== userId && conn.socket.readyState === WebSocket.OPEN) {
                    conn.socket.send(JSON.stringify(parsedMessage));
                  }
                });
              }
            }
            break;
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      // Remove this connection when the socket is closed
      if (meetingId && userId && userInfo) {
        console.log(`User ${userInfo.displayName} (${userId}) disconnected from meeting ${meetingId}`);
        
        const connectionsMap = meetingConnections.get(meetingId);
        
        if (connectionsMap) {
          // Remove this user's connection
          connectionsMap.delete(userId);
          
          // Notify other participants that this user has left
          connectionsMap.forEach((conn) => {
            if (conn.socket.readyState === WebSocket.OPEN) {
              conn.socket.send(JSON.stringify({
                type: 'user-left',
                meetingId,
                from: {
                  userId,
                  username: userInfo.username,
                  displayName: userInfo.displayName
                }
              }));
            }
          });
          
          // If no more connections for this meeting, remove the meeting entry
          if (connectionsMap.size === 0) {
            meetingConnections.delete(meetingId);
          }
        }
      }
    });
  });
  
  return httpServer;
}
