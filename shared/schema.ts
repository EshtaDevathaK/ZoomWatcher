import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  meetingCode: text("meeting_code").notNull().unique(),
  hostId: integer("host_id").references(() => users.id).notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  meetingId: integer("meeting_id").references(() => meetings.id).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
});

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  autoMuteEnabled: boolean("auto_mute_enabled").default(true).notNull(),
  autoVideoOffEnabled: boolean("auto_video_off_enabled").default(true).notNull(),
  alwaysOnModeEnabled: boolean("always_on_mode_enabled").default(false).notNull(),
  autoMuteAlertsEnabled: boolean("auto_mute_alerts_enabled").default(true).notNull(),
  autoVideoAlertsEnabled: boolean("auto_video_alerts_enabled").default(true).notNull(),
  vibrationFeedbackEnabled: boolean("vibration_feedback_enabled").default(true).notNull(),
  allNotificationsDisabled: boolean("all_notifications_disabled").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users)
  .omit({ id: true, createdAt: true });

export const insertMeetingSchema = createInsertSchema(meetings)
  .omit({ id: true, createdAt: true, isActive: true });

export const insertParticipantSchema = createInsertSchema(participants)
  .omit({ id: true, joinedAt: true, leftAt: true });

export const insertUserSettingsSchema = createInsertSchema(userSettings)
  .omit({ id: true, updatedAt: true });

// Update schemas
export const updateUserSchema = insertUserSchema.partial();

export const updateUserSettingsSchema = insertUserSettingsSchema
  .omit({ userId: true })
  .partial();

// Custom schemas
export const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const joinMeetingSchema = z.object({
  meetingCode: z.string().length(6, "Meeting code must be exactly 6 characters"),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Participant = typeof participants.$inferSelect;

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

export type Login = z.infer<typeof loginSchema>;
export type JoinMeeting = z.infer<typeof joinMeetingSchema>;
