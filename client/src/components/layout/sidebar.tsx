import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Home, Users, Clock, Settings, LogOut, Menu } from "lucide-react";
import Logo from "@/components/ui/logo";

export function Sidebar() {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleLogout = async () => {
    if (confirm("Are you sure you want to log out?")) {
      try {
        await logoutMutation.mutateAsync();
        // Force reload the page to ensure all state is reset
        window.location.href = "/auth";
      } catch (error) {
        console.error("Logout failed:", error);
      }
    }
  };

  return (
    <>
      {/* Mobile Navigation Header */}
      <div className="bg-gray-800 text-white md:hidden p-4 flex justify-between items-center">
        <Button 
          variant="ghost" 
          className="text-white p-0" 
          onClick={toggleSidebar}
        >
          <Menu className="w-6 h-6" />
        </Button>
        <Logo className="h-8 w-8" />
        <div className="w-6"></div> {/* Spacer for centering */}
      </div>

      {/* Sidebar Navigation */}
      <nav 
        className={`bg-gray-800 text-white fixed h-full w-64 z-50 left-0 top-0 transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 transition-transform duration-200 ease-in-out`}
      >
        <div className="p-6">
          <div className="flex items-center mb-8">
            <Logo className="h-10 w-10 mr-3" />
            <h1 className="text-xl font-bold">ZoomWatcher</h1>
          </div>
          <ul className="space-y-2">
            <li>
              <Link href="/" className={`flex items-center p-2 rounded-md ${
                location === "/" ? "bg-gray-700" : "hover:bg-gray-700"
              }`}>
                <Home className="w-5 h-5 mr-3" />
                Dashboard
              </Link>
            </li>
            <li>
              <Link href="/meetings" className={`flex items-center p-2 rounded-md ${
                location === "/meetings" ? "bg-gray-700" : "hover:bg-gray-700"
              }`}>
                <Users className="w-5 h-5 mr-3" />
                Meetings
              </Link>
            </li>
            <li>
              <Link href="/history" className={`flex items-center p-2 rounded-md ${
                location === "/history" ? "bg-gray-700" : "hover:bg-gray-700"
              }`}>
                <Clock className="w-5 h-5 mr-3" />
                History
              </Link>
            </li>
            <li>
              <Link href="/settings" className={`flex items-center p-2 rounded-md ${
                location === "/settings" ? "bg-gray-700" : "hover:bg-gray-700"
              }`}>
                <Settings className="w-5 h-5 mr-3" />
                Settings
              </Link>
            </li>
          </ul>
        </div>
        <div className="absolute bottom-0 w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Avatar className="h-8 w-8 mr-2">
                <AvatarFallback>
                  {user?.displayName?.charAt(0) || user?.username?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <p className="font-medium">{user?.displayName || user?.username}</p>
                <p className="text-gray-400 text-xs truncate max-w-[150px]">{user?.email}</p>
              </div>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="flex items-center p-2 rounded-md hover:bg-gray-700 w-full justify-start" 
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="w-5 h-5 mr-3" />
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </nav>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </>
  );
}
