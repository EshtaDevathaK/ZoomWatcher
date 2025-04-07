import { users, type User, type InsertUser, meetings, type Meeting, type InsertMeeting, participants, type Participant, type InsertParticipant, userSettings, type UserSettings, type InsertUserSettings } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

// modify the interface with any CRUD methods
// you might need
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined>;
  
  // Meeting methods
  createMeeting(meeting: InsertMeeting): Promise<Meeting>;
  getMeeting(id: number): Promise<Meeting | undefined>;
  getMeetingByCode(code: string): Promise<Meeting | undefined>;
  getMeetingsByUserId(userId: number): Promise<Meeting[]>;
  updateMeeting(id: number, meetingData: Partial<InsertMeeting>): Promise<Meeting | undefined>;
  endMeeting(id: number): Promise<boolean>;
  
  // Participant methods
  addParticipant(participant: InsertParticipant): Promise<Participant>;
  getParticipantsByMeetingId(meetingId: number): Promise<Participant[]>;
  removeParticipant(userId: number, meetingId: number): Promise<boolean>;
  
  // User Settings methods
  getUserSettings(userId: number): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(userId: number, settingsData: Partial<InsertUserSettings>): Promise<UserSettings | undefined>;
  
  // Session store for authentication
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private meetings: Map<number, Meeting>;
  private participants: Map<number, Participant>;
  private userSettings: Map<number, UserSettings>;
  sessionStore: session.SessionStore;
  
  currentUserId: number;
  currentMeetingId: number;
  currentParticipantId: number;
  currentSettingsId: number;

  constructor() {
    this.users = new Map();
    this.meetings = new Map();
    this.participants = new Map();
    this.userSettings = new Map();
    
    this.currentUserId = 1;
    this.currentMeetingId = 1;
    this.currentParticipantId = 1;
    this.currentSettingsId = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const now = new Date();
    const user: User = { ...insertUser, id, createdAt: now };
    this.users.set(id, user);
    
    // Create default settings for the user
    await this.createUserSettings({
      userId: id,
      autoMuteEnabled: true,
      autoVideoOffEnabled: true,
      alwaysOnModeEnabled: false,
      autoMuteAlertsEnabled: true,
      autoVideoAlertsEnabled: true,
      vibrationFeedbackEnabled: true,
      allNotificationsDisabled: false
    });
    
    return user;
  }
  
  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  // Meeting methods
  async createMeeting(meeting: InsertMeeting): Promise<Meeting> {
    const id = this.currentMeetingId++;
    const now = new Date();
    const newMeeting: Meeting = { ...meeting, id, isActive: true, createdAt: now };
    this.meetings.set(id, newMeeting);
    return newMeeting;
  }
  
  async getMeeting(id: number): Promise<Meeting | undefined> {
    return this.meetings.get(id);
  }
  
  async getMeetingByCode(code: string): Promise<Meeting | undefined> {
    return Array.from(this.meetings.values()).find(
      (meeting) => meeting.meetingCode === code,
    );
  }
  
  async getMeetingsByUserId(userId: number): Promise<Meeting[]> {
    // Return meetings where the user is the host
    return Array.from(this.meetings.values()).filter(
      (meeting) => meeting.hostId === userId,
    );
  }
  
  async updateMeeting(id: number, meetingData: Partial<InsertMeeting>): Promise<Meeting | undefined> {
    const meeting = await this.getMeeting(id);
    if (!meeting) return undefined;
    
    const updatedMeeting = { ...meeting, ...meetingData };
    this.meetings.set(id, updatedMeeting);
    return updatedMeeting;
  }
  
  async endMeeting(id: number): Promise<boolean> {
    const meeting = await this.getMeeting(id);
    if (!meeting) return false;
    
    meeting.isActive = false;
    this.meetings.set(id, meeting);
    
    // Mark all participants as left
    const participants = await this.getParticipantsByMeetingId(id);
    for (const participant of participants) {
      if (!participant.leftAt) {
        participant.leftAt = new Date();
        this.participants.set(participant.id, participant);
      }
    }
    
    return true;
  }
  
  // Participant methods
  async addParticipant(participant: InsertParticipant): Promise<Participant> {
    const id = this.currentParticipantId++;
    const now = new Date();
    const newParticipant: Participant = { ...participant, id, joinedAt: now, leftAt: null };
    this.participants.set(id, newParticipant);
    return newParticipant;
  }
  
  async getParticipantsByMeetingId(meetingId: number): Promise<Participant[]> {
    return Array.from(this.participants.values()).filter(
      (participant) => participant.meetingId === meetingId,
    );
  }
  
  async removeParticipant(userId: number, meetingId: number): Promise<boolean> {
    const participant = Array.from(this.participants.values()).find(
      (p) => p.userId === userId && p.meetingId === meetingId && !p.leftAt,
    );
    
    if (!participant) return false;
    
    participant.leftAt = new Date();
    this.participants.set(participant.id, participant);
    return true;
  }
  
  // User Settings methods
  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    return Array.from(this.userSettings.values()).find(
      (settings) => settings.userId === userId,
    );
  }
  
  async createUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const id = this.currentSettingsId++;
    const now = new Date();
    const newSettings: UserSettings = { ...settings, id, updatedAt: now };
    this.userSettings.set(id, newSettings);
    return newSettings;
  }
  
  async updateUserSettings(userId: number, settingsData: Partial<InsertUserSettings>): Promise<UserSettings | undefined> {
    const settings = await this.getUserSettings(userId);
    if (!settings) return undefined;
    
    const now = new Date();
    const updatedSettings = { ...settings, ...settingsData, updatedAt: now };
    this.userSettings.set(settings.id, updatedSettings);
    return updatedSettings;
  }
}

export const storage = new MemStorage();
