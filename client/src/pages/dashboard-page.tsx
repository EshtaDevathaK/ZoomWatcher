import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MicMonitor } from "@/components/media/mic-monitor";
import { FaceDetector } from "@/components/media/face-detector";
import { requestPermissions } from "@/lib/media-permissions";

// Define schema for joining a meeting
const joinMeetingSchema = z.object({
  meetingCode: z.string().length(6, "Meeting code must be exactly 6 characters")
});

type JoinMeetingFormValues = z.infer<typeof joinMeetingSchema>;

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);

  // Check for media permissions on load
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setCheckingPermissions(true);
        const result = await requestPermissions();
        setPermissionsGranted(result);
      } catch (error) {
        console.error("Error checking permissions:", error);
        setPermissionsGranted(false);
      } finally {
        setCheckingPermissions(false);
      }
    };

    checkPermissions();
  }, []);

  // Fetch user settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["/api/settings"],
    enabled: !!user && permissionsGranted,
  });

  // Fetch meetings
  const { data: meetings, isLoading: isLoadingMeetings } = useQuery({
    queryKey: ["/api/meetings"],
    enabled: !!user,
  });

  // Start a new meeting mutation
  const createMeetingMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/meetings", { name });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      navigate(`/meeting/${data.id}`);
      toast({
        title: "Meeting created",
        description: `Your meeting "${data.name}" has been created.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create meeting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Join meeting form
  const joinMeetingForm = useForm<JoinMeetingFormValues>({
    resolver: zodResolver(joinMeetingSchema),
    defaultValues: {
      meetingCode: ""
    }
  });

  // Join meeting mutation
  const joinMeetingMutation = useMutation({
    mutationFn: async (data: JoinMeetingFormValues) => {
      const res = await apiRequest("POST", "/api/meetings/join", data);
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/meeting/${data.id}`);
      toast({
        title: "Meeting joined",
        description: `You have joined the meeting "${data.name}".`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to join meeting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings updated",
        description: "Your settings have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle start meeting
  const startNewMeeting = () => {
    const meetingName = prompt("Enter meeting name");
    if (meetingName) {
      createMeetingMutation.mutate(meetingName);
    }
  };

  // Handle join meeting
  const onJoinMeeting = (data: JoinMeetingFormValues) => {
    joinMeetingMutation.mutate(data);
  };

  // Handle toggle always-on mode
  const toggleAlwaysOnMode = (checked: boolean) => {
    if (settings) {
      updateSettingsMutation.mutate({
        alwaysOnModeEnabled: checked
      });
    }
  };

  // Permission request component
  if (checkingPermissions) {
    return (
      <div className="flex flex-col min-h-screen">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-4" />
            <h2 className="text-xl font-semibold">Checking permissions...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!permissionsGranted) {
    return (
      <div className="flex flex-col min-h-screen">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md mx-4 p-6">
            <div className="text-center mb-4">
              <h3 className="text-xl font-medium text-gray-900">Permission Required</h3>
            </div>
            <p className="text-gray-600 mb-6">
              ZoomWatcher needs access to your camera and microphone to function properly. 
              Please allow these permissions to continue.
            </p>
            <div className="flex justify-center">
              <Button
                onClick={async () => {
                  const result = await requestPermissions();
                  setPermissionsGranted(result);
                }}
              >
                Allow Permissions
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="md:ml-64 pt-4 md:pt-0 min-h-screen p-6">
        <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
        
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Host a Meeting</h3>
              <p className="text-gray-600 mb-4">Start a new meeting and invite others to join.</p>
              <Button 
                className="w-full" 
                onClick={startNewMeeting}
                disabled={createMeetingMutation.isPending}
              >
                {createMeetingMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : "Start New Meeting"}
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Join a Meeting</h3>
              <p className="text-gray-600 mb-4">Enter a meeting code to join an existing meeting.</p>
              <form onSubmit={joinMeetingForm.handleSubmit(onJoinMeeting)} className="flex gap-2">
                <Input
                  placeholder="Enter 6-digit code"
                  {...joinMeetingForm.register("meetingCode")}
                  className="flex-1"
                  disabled={joinMeetingMutation.isPending}
                  maxLength={6}
                />
                <Button 
                  type="submit"
                  disabled={joinMeetingMutation.isPending}
                >
                  {joinMeetingMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : "Join"}
                </Button>
              </form>
              {joinMeetingForm.formState.errors.meetingCode && (
                <p className="text-red-500 text-sm mt-1">
                  {joinMeetingForm.formState.errors.meetingCode.message}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">Microphone</h3>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                  Active
                </span>
              </div>
              <p className="text-gray-600 text-sm">
                Auto-mute will activate after 2 minutes of silence
              </p>
              
              {/* Microphone monitoring (invisible component) */}
              {settings && !settings.alwaysOnModeEnabled && settings.autoMuteEnabled && (
                <MicMonitor 
                  inactivityThreshold={120000} // 2 minutes
                  muted={false}
                  enabled={true}
                  alertsEnabled={settings.autoMuteAlertsEnabled && !settings.allNotificationsDisabled}
                  vibrationEnabled={settings.vibrationFeedbackEnabled && !settings.allNotificationsDisabled}
                />
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">Camera</h3>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                  Active
                </span>
              </div>
              <p className="text-gray-600 text-sm">
                Face detection active. Auto-off in 15s if no face detected
              </p>
              
              {/* Face detection (invisible component) */}
              {settings && !settings.alwaysOnModeEnabled && settings.autoVideoOffEnabled && (
                <FaceDetector 
                  inactivityThreshold={15000} // 15 seconds
                  cameraOff={false}
                  enabled={true}
                  alertsEnabled={settings.autoVideoAlertsEnabled && !settings.allNotificationsDisabled}
                  vibrationEnabled={settings.vibrationFeedbackEnabled && !settings.allNotificationsDisabled}
                />
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">Always-On Mode</h3>
                {isLoadingSettings ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Switch
                    checked={settings?.alwaysOnModeEnabled || false}
                    onCheckedChange={toggleAlwaysOnMode}
                    disabled={updateSettingsMutation.isPending}
                  />
                )}
              </div>
              <p className="text-gray-600 text-sm">
                Disable auto-mute and auto-video off
              </p>
            </CardContent>
          </Card>
        </div>
        
        {/* Recent Meetings */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">Recent Meetings</h3>
            {isLoadingMeetings ? (
              <div className="flex justify-center my-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : meetings && meetings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Meeting Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Meeting Code
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {meetings.map((meeting: any) => (
                      <tr key={meeting.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {meeting.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(meeting.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {meeting.meetingCode}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {meeting.isActive ? (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                              Ended
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {meeting.isActive && (
                            <Button
                              variant="link"
                              className="p-0 h-auto text-primary hover:text-blue-700"
                              onClick={() => navigate(`/meeting/${meeting.id}`)}
                            >
                              Rejoin
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No recent meetings. Start a new meeting to get started.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
