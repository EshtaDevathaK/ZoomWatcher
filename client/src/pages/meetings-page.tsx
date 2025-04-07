import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Copy, Mail, Share } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Define schema for creating a meeting
const createMeetingSchema = z.object({
  name: z.string().min(3, "Meeting name must be at least 3 characters")
});

type CreateMeetingFormValues = z.infer<typeof createMeetingSchema>;

// Define schema for joining a meeting
const joinMeetingSchema = z.object({
  meetingCode: z.string().length(6, "Meeting code must be exactly 6 characters")
});

type JoinMeetingFormValues = z.infer<typeof joinMeetingSchema>;

export default function MeetingsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeMeeting, setActiveMeeting] = useState<any>(null);
  


  // Fetch meetings
  const { data: meetings = [], isLoading: isLoadingMeetings } = useQuery<any[]>({
    queryKey: ["/api/meetings"],
  });

  // Create meeting form
  const createMeetingForm = useForm<CreateMeetingFormValues>({
    resolver: zodResolver(createMeetingSchema),
    defaultValues: {
      name: ""
    }
  });

  // Join meeting form
  const joinMeetingForm = useForm<JoinMeetingFormValues>({
    resolver: zodResolver(joinMeetingSchema),
    defaultValues: {
      meetingCode: ""
    }
  });

  // Create a new meeting mutation
  const createMeetingMutation = useMutation({
    mutationFn: async (data: CreateMeetingFormValues) => {
      const res = await apiRequest("POST", "/api/meetings", data);
      return res.json();
    },
    onSuccess: (data) => {
      createMeetingForm.reset();
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

  // Join meeting mutation
  const joinMeetingMutation = useMutation({
    mutationFn: async (data: JoinMeetingFormValues) => {
      const res = await apiRequest("POST", "/api/meetings/join", data);
      return res.json();
    },
    onSuccess: (data) => {
      joinMeetingForm.reset();
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

  // End meeting mutation
  const endMeetingMutation = useMutation({
    mutationFn: async (meetingId: number) => {
      const res = await apiRequest("POST", `/api/meetings/${meetingId}/end`, {});
      return res.json();
    },
    onSuccess: () => {
      setActiveMeeting(null);
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast({
        title: "Meeting ended",
        description: "The meeting has been ended successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to end meeting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Start an existing meeting
  const startScheduledMeeting = (meeting: any) => {
    navigate(`/meeting/${meeting.id}`);
  };

  // Cancel a scheduled meeting
  const cancelMeeting = (meetingId: number) => {
    if (confirm("Are you sure you want to cancel this meeting?")) {
      endMeetingMutation.mutate(meetingId);
    }
  };



  // Copy meeting link to clipboard
  const copyMeetingLink = (code: string) => {
    const link = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Meeting link copied",
      description: "The meeting link has been copied to clipboard.",
    });
  };

  // Share meeting via email
  const shareViaEmail = (meeting: any) => {
    const link = `${window.location.origin}/join/${meeting.meetingCode}`;
    const subject = encodeURIComponent(`Join my ZoomWatcher meeting: ${meeting.name}`);
    const body = encodeURIComponent(`Join my ZoomWatcher meeting.\n\nMeeting name: ${meeting.name}\nMeeting code: ${meeting.meetingCode}\nLink: ${link}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  // Share meeting via WhatsApp
  const shareViaWhatsApp = (meeting: any) => {
    const link = `${window.location.origin}/join/${meeting.meetingCode}`;
    const text = encodeURIComponent(`Join my ZoomWatcher meeting.\n\nMeeting name: ${meeting.name}\nMeeting code: ${meeting.meetingCode}\nLink: ${link}`);
    window.open(`https://wa.me/?text=${text}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="md:ml-64 pt-4 md:pt-0 min-h-screen p-6">
        <h2 className="text-2xl font-bold mb-6">Meetings</h2>
        
        {/* Active Meeting (if in a meeting) */}
        {activeMeeting && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Current Meeting: {activeMeeting.name}</h3>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">Active</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-sm text-gray-600 mb-2">Meeting Code:</p>
                  <div className="flex items-center">
                    <span className="text-lg font-medium mr-2">{activeMeeting.meetingCode}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-auto"
                      onClick={() => {
                        navigator.clipboard.writeText(activeMeeting.meetingCode);
                        toast({
                          title: "Meeting code copied",
                          description: "The meeting code has been copied to clipboard. Share this with others to invite them.",
                        });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-2">Meeting Link:</p>
                  <div className="flex items-center">
                    <span className="text-sm text-gray-800 truncate mr-2">
                      {`${window.location.origin}/join/${activeMeeting.meetingCode}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-auto"
                      onClick={() => copyMeetingLink(activeMeeting.meetingCode)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 flex flex-col md:flex-row gap-2">
                  <Button 
                    variant="outline"
                    className="flex-1"
                    onClick={() => shareViaEmail(activeMeeting)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Share via Email
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1"
                    onClick={() => shareViaWhatsApp(activeMeeting)}
                  >
                    <Share className="mr-2 h-4 w-4" />
                    Share via WhatsApp
                  </Button>
                </div>
                <Button 
                  variant="destructive"
                  onClick={() => endMeetingMutation.mutate(activeMeeting.id)}
                  disabled={endMeetingMutation.isPending}
                >
                  {endMeetingMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Ending...
                    </>
                  ) : "End Meeting"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Start/Join Meeting Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Start a New Meeting</h3>
              <p className="text-gray-600 mb-4">Create a meeting and invite others to join.</p>
              <Form {...createMeetingForm}>
                <form onSubmit={createMeetingForm.handleSubmit((data) => createMeetingMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={createMeetingForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting Name</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g. Team Standup"
                            disabled={createMeetingMutation.isPending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={createMeetingMutation.isPending}
                  >
                    {createMeetingMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : "Start Meeting"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Join a Meeting</h3>
              <p className="text-gray-600 mb-4">Enter a meeting code to join.</p>
              <Form {...joinMeetingForm}>
                <form onSubmit={joinMeetingForm.handleSubmit((data) => joinMeetingMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={joinMeetingForm.control}
                    name="meetingCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting Code</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Enter 6-digit code"
                            disabled={joinMeetingMutation.isPending}
                            maxLength={6}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={joinMeetingMutation.isPending}
                  >
                    {joinMeetingMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Joining...
                      </>
                    ) : "Join Meeting"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
        
        {/* Scheduled Meetings */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">My Meetings</h3>
            {isLoadingMeetings ? (
              <div className="flex justify-center my-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : meetings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Meeting Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date & Time
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
                          {new Date(meeting.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center">
                            <span>{meeting.meetingCode}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-1 h-auto ml-2"
                              onClick={() => {
                                navigator.clipboard.writeText(meeting.meetingCode);
                                toast({
                                  title: "Meeting code copied",
                                  description: "The meeting code has been copied to clipboard. Share this with others to invite them.",
                                });
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 space-x-2">
                          {meeting.isActive ? (
                            <>
                              <Button
                                variant="link"
                                className="p-0 h-auto text-primary hover:text-blue-700"
                                onClick={() => startScheduledMeeting(meeting)}
                              >
                                Join
                              </Button>
                              <Button
                                variant="link"
                                className="p-0 h-auto text-red-500 hover:text-red-700"
                                onClick={() => cancelMeeting(meeting.id)}
                                disabled={endMeetingMutation.isPending}
                              >
                                End
                              </Button>
                            </>
                          ) : (
                            <span className="text-gray-400">Ended</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No meetings found. Start a new meeting to get started.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
