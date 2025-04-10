import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface MeetingStats {
  totalMeetings: number;
  totalDuration: number;
  averageDuration: number;
  totalParticipants: number;
  averageParticipants: number;
}

interface MeetingData {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: number;
}

interface UserSettings {
  autoMuteEnabled: boolean;
  autoVideoOffEnabled: boolean;
  alwaysOnModeEnabled: boolean;
  autoMuteAlertsEnabled: boolean;
  autoVideoAlertsEnabled: boolean;
  vibrationFeedbackEnabled: boolean;
  allNotificationsDisabled: boolean;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [stats, setStats] = useState<MeetingStats>({
    totalMeetings: 0,
    totalDuration: 0,
    averageDuration: 0,
    totalParticipants: 0,
    averageParticipants: 0
  });
  const [meetings, setMeetings] = useState<MeetingData[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
    autoMuteEnabled: false,
    autoVideoOffEnabled: false,
    alwaysOnModeEnabled: false,
    autoMuteAlertsEnabled: true,
    autoVideoAlertsEnabled: true,
    vibrationFeedbackEnabled: true,
    allNotificationsDisabled: false
  });

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!user) return;

      try {
        const [statsResponse, meetingsResponse, settingsResponse] = await Promise.all([
          apiRequest('GET', '/api/stats'),
          apiRequest('GET', '/api/meetings'),
          apiRequest('GET', `/api/users/${user.id}/settings`)
        ]);

        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setStats(statsData);
        }

        if (meetingsResponse.ok) {
          const meetingsData = await meetingsResponse.json();
          setMeetings(meetingsData);
        }

        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          setSettings(settingsData);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load dashboard data. Please try again.',
          variant: 'destructive'
        });
      }
    };

    loadDashboardData();
  }, [user, toast]);

  const chartData = meetings.map(meeting => ({
    name: new Date(meeting.date).toLocaleDateString(),
    duration: Math.round(meeting.duration / 60), // Convert to minutes
    participants: meeting.participants
  }));

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMeetings}</div>
            <p className="text-xs text-muted-foreground">
              meetings attended
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(stats.totalDuration / 60)} min
            </div>
            <p className="text-xs text-muted-foreground">
              total time in meetings
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(stats.averageDuration / 60)} min
            </div>
            <p className="text-xs text-muted-foreground">
              per meeting
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Participants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(stats.averageParticipants)}
            </div>
            <p className="text-xs text-muted-foreground">
              per meeting
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Meeting Activity</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="duration"
                  stroke="#8884d8"
                  name="Duration (min)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="participants"
                  stroke="#82ca9d"
                  name="Participants"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>
              Select a date to view meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border"
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {meetings.slice(0, 5).map(meeting => (
                <div key={meeting.id} className="flex items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {meeting.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(meeting.date).toLocaleDateString()} - {Math.round(meeting.duration / 60)} minutes
                    </p>
                  </div>
                  <div className="ml-auto font-medium">
                    {meeting.participants} participants
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
