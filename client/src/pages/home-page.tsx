import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import DashboardPage from "./dashboard-page";

export default function HomePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Redirect to dashboard
  useEffect(() => {
    navigate("/");
  }, [navigate]);

  return <DashboardPage />;
}
