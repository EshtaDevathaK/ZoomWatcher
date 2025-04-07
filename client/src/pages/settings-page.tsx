import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";

// Define schema for updating user profile
const userProfileSchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

type UserProfileFormValues = z.infer<typeof userProfileSchema>;

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isFormDirty, setIsFormDirty] = useState(false);

  // Fetch user settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["/api/settings"],
    enabled: !!user,
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

  // Update user profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: UserProfileFormValues) => {
      const res = await apiRequest("PUT", "/api/user", data);
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setIsFormDirty(false);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // User profile form
  const profileForm = useForm<UserProfileFormValues>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {
      displayName: user?.displayName || "",
      email: user?.email || "",
    },
  });

  // Update form values when user data changes
  useEffect(() => {
    if (user) {
      profileForm.reset({
        displayName: user.displayName,
        email: user.email,
      });
    }
  }, [user, profileForm]);

  // Handle form value changes
  useEffect(() => {
    const subscription = profileForm.watch(() => {
      setIsFormDirty(true);
    });
    return () => subscription.unsubscribe();
  }, [profileForm]);

  // Toggle setting functions
  const toggleSetting = (setting: string, checked: boolean) => {
    updateSettingsMutation.mutate({ [setting]: checked });
  };

  // Handle profile form submission
  const onSubmitProfile = (data: UserProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="md:ml-64 pt-4 md:pt-0 min-h-screen p-6">
        <h2 className="text-2xl font-bold mb-6">Settings</h2>
        
        {/* AI Features Settings */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">AI Features</h3>
            
            {isLoadingSettings ? (
              <div className="flex justify-center my-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Voice Auto-Mute */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Voice Auto-Mute</h4>
                    <p className="text-sm text-gray-500">Automatically mute your microphone after 2 minutes of silence</p>
                  </div>
                  <Switch
                    checked={settings?.autoMuteEnabled || false}
                    onCheckedChange={(checked) => toggleSetting("autoMuteEnabled", checked)}
                    disabled={updateSettingsMutation.isPending}
                  />
                </div>
                
                {/* Video Auto-Turn OFF */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Video Auto-Turn OFF</h4>
                    <p className="text-sm text-gray-500">Automatically turn off camera after 15 seconds of no face detected</p>
                  </div>
                  <Switch
                    checked={settings?.autoVideoOffEnabled || false}
                    onCheckedChange={(checked) => toggleSetting("autoVideoOffEnabled", checked)}
                    disabled={updateSettingsMutation.isPending}
                  />
                </div>
                
                {/* Always-On Mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Always-On Mode</h4>
                    <p className="text-sm text-gray-500">Prevent auto-muting & auto-video off</p>
                  </div>
                  <Switch
                    checked={settings?.alwaysOnModeEnabled || false}
                    onCheckedChange={(checked) => toggleSetting("alwaysOnModeEnabled", checked)}
                    disabled={updateSettingsMutation.isPending}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Notification Settings */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">Notifications</h3>
            
            {isLoadingSettings ? (
              <div className="flex justify-center my-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Auto-Mute Alerts */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Auto-Mute Alerts</h4>
                    <p className="text-sm text-gray-500">Show alerts when microphone is auto-muted</p>
                  </div>
                  <Switch
                    checked={settings?.autoMuteAlertsEnabled || false}
                    onCheckedChange={(checked) => toggleSetting("autoMuteAlertsEnabled", checked)}
                    disabled={updateSettingsMutation.isPending || settings?.allNotificationsDisabled}
                  />
                </div>
                
                {/* Auto-Video Off Alerts */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Auto-Video Off Alerts</h4>
                    <p className="text-sm text-gray-500">Show alerts when camera is auto-turned off</p>
                  </div>
                  <Switch
                    checked={settings?.autoVideoAlertsEnabled || false}
                    onCheckedChange={(checked) => toggleSetting("autoVideoAlertsEnabled", checked)}
                    disabled={updateSettingsMutation.isPending || settings?.allNotificationsDisabled}
                  />
                </div>
                
                {/* Vibration Feedback */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Vibration Feedback</h4>
                    <p className="text-sm text-gray-500">Enable vibration when actions are taken</p>
                  </div>
                  <Switch
                    checked={settings?.vibrationFeedbackEnabled || false}
                    onCheckedChange={(checked) => toggleSetting("vibrationFeedbackEnabled", checked)}
                    disabled={updateSettingsMutation.isPending || settings?.allNotificationsDisabled}
                  />
                </div>
                
                {/* Disable All Notifications */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Disable All Notifications</h4>
                    <p className="text-sm text-gray-500">Completely silence pop-ups & vibrations</p>
                  </div>
                  <Switch
                    checked={settings?.allNotificationsDisabled || false}
                    onCheckedChange={(checked) => toggleSetting("allNotificationsDisabled", checked)}
                    disabled={updateSettingsMutation.isPending}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Account Settings */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">Account</h3>
            
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onSubmitProfile)} className="space-y-6">
                <FormField
                  control={profileForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Enter your display name"
                          disabled={updateProfileMutation.isPending}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={profileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Enter your email"
                          type="email"
                          disabled={updateProfileMutation.isPending}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  disabled={updateProfileMutation.isPending || !isFormDirty}
                >
                  {updateProfileMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : "Save Changes"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
