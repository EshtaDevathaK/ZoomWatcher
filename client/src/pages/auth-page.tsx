import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { insertUserSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Logo } from "@/components/ui/logo";

// Login form schema
const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// Registration form schema
const registrationSchema = insertUserSchema.extend({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  displayName: z.string().min(2, "Display name must be at least 2 characters"),
});

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, navigate] = useLocation();
  const [showSignUp, setShowSignUp] = useState(false);

  // Clear any stored credentials when component mounts
  useEffect(() => {
    localStorage.removeItem('rememberedUser');
  }, []);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  // Login form
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  // Registration form
  const registerForm = useForm<z.infer<typeof registrationSchema>>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      username: "",
      email: "",
      displayName: "",
      password: "",
    },
  });

  // Handle login submission
  const onLoginSubmit = async (data: LoginFormValues) => {
    try {
      const result = await loginMutation.mutateAsync({
        username: data.username,
        password: data.password,
      });
      if (result) {
        // Only save credentials if rememberMe is checked and login is successful
        if (data.rememberMe) {
          localStorage.setItem('rememberedUser', data.username);
        } else {
          localStorage.removeItem('rememberedUser');
        }
        // Force a hard navigation to ensure state is reset properly
        window.location.href = "/";
      }
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  // Handle registration submission
  const onRegisterSubmit = async (data: z.infer<typeof registrationSchema>) => {
    try {
      const result = await registerMutation.mutateAsync(data);
      if (result) {
        // Force a hard navigation to ensure state is reset properly
        window.location.href = "/";
      }
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Logo className="mx-auto h-20 w-auto" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">ZoomWatcher</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Your AI-powered meeting assistant
          </p>
        </div>

        {/* Login Form */}
        <Card className={`bg-white shadow-md ${showSignUp ? 'hidden' : ''}`}>
          <CardContent className="pt-6">
            <h3 className="text-xl font-bold mb-6 text-center">Sign In</h3>
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-6">
                <FormField
                  control={loginForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Enter your username" 
                          type="text"
                          autoComplete="new-password"
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck="false"
                          data-form-type="other"
                          disabled={loginMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Enter your password" 
                          type="password"
                          autoComplete="new-password"
                          data-form-type="other"
                          disabled={loginMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={loginForm.control}
                  name="rememberMe"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={loginMutation.isPending}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Remember me</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </Form>
            <div className="text-center mt-4">
              <span className="text-sm">Don't have an account?</span>
              <button 
                className="text-primary hover:text-blue-700 font-medium text-sm ml-1" 
                onClick={() => setShowSignUp(true)}
                disabled={loginMutation.isPending}
              >
                Sign up
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Registration Form */}
        <Card className={`bg-white shadow-md ${!showSignUp ? 'hidden' : ''}`}>
          <CardContent className="pt-6">
            <h3 className="text-xl font-bold mb-6 text-center">Create Account</h3>
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-6">
                <FormField
                  control={registerForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Enter your full name" 
                          type="text"
                          disabled={registerMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={registerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Enter your email" 
                          type="email"
                          autoComplete="email"
                          disabled={registerMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={registerForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Choose a username" 
                          type="text"
                          autoComplete="username"
                          disabled={registerMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Create a password" 
                          type="password"
                          autoComplete="new-password"
                          disabled={registerMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? "Creating account..." : "Create account"}
                </Button>
              </form>
            </Form>
            <div className="text-center mt-4">
              <span className="text-sm">Already have an account?</span>
              <button 
                className="text-primary hover:text-blue-700 font-medium text-sm ml-1" 
                onClick={() => setShowSignUp(false)}
                disabled={registerMutation.isPending}
              >
                Sign in
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
