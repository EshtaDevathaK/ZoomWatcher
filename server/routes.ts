import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import { generateMeetingCode } from "../shared/utils";
import { insertMeetingSchema, insertParticipantSchema, updateUserSettingsSchema } from "@shared/schema";

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
  return httpServer;
}
