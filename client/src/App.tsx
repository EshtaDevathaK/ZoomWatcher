import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import DashboardPage from "@/pages/dashboard-page";
import SettingsPage from "@/pages/settings-page";
import MeetingsPage from "@/pages/meetings-page";
import MeetingRoom from "@/pages/meeting-room";
import { ProtectedRoute } from "./lib/protected-route";
import { useEffect, useState } from "react";
import { AuthProvider } from "./hooks/use-auth";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={DashboardPage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <ProtectedRoute path="/meetings" component={MeetingsPage} />
      <ProtectedRoute path="/meeting/:id" component={MeetingRoom} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Set document title
  useEffect(() => {
    document.title = "ZoomWatcher - AI Meeting Assistant";
  }, []);

  return (
    <AuthProvider>
      <Router />
      <Toaster />
    </AuthProvider>
  );
}

export default App;
