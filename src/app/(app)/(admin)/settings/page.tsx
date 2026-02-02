"use client";

import { useAuth } from "@/providers/auth-provider";
import { Settings, Server, HardDrive, Lock, Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

import { PageHeader } from "@/components/common/page-header";

// -- helpers --

function SettingRow({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <Input value={value} disabled className="bg-muted/50" />
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

// -- page --

export default function SettingsPage() {
  const { user } = useAuth();

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be an administrator to view settings.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="System configuration overview. Settings are configured via environment variables and shown read-only."
      />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>Read-only Configuration</AlertTitle>
        <AlertDescription>
          Server settings are configured via environment variables. The values
          shown below reflect the current runtime configuration.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <Server className="size-4 mr-1.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="storage">
            <HardDrive className="size-4 mr-1.5" />
            Storage
          </TabsTrigger>
          <TabsTrigger value="auth">
            <Lock className="size-4 mr-1.5" />
            Authentication
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General Settings</CardTitle>
              <CardDescription>
                Core server configuration and version information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label="API URL"
                value={
                  typeof window !== "undefined"
                    ? process.env.NEXT_PUBLIC_API_URL || window.location.origin
                    : "Loading..."
                }
                description="The base URL used by the frontend to reach the API server."
              />
              <Separator />
              <SettingRow
                label="Version"
                value="1.0.0"
                description="Current Artifact Keeper server version."
              />
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm">Environment</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Production</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Storage Settings</CardTitle>
              <CardDescription>
                Artifact storage backend and path configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label="Storage Backend"
                value="Local Filesystem"
                description="The type of storage backend used for artifact data."
              />
              <Separator />
              <SettingRow
                label="Storage Path"
                value="/data/artifacts"
                description="The filesystem path where artifact files are stored."
              />
              <Separator />
              <SettingRow
                label="Max Upload Size"
                value="5 GB"
                description="Maximum allowed size for a single artifact upload."
              />
              <Separator />
              <SettingRow
                label="Deduplication"
                value="Enabled (SHA-256)"
                description="Content-addressable storage to avoid storing duplicate artifacts."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Authentication Settings</CardTitle>
              <CardDescription>
                Token and session configuration for user authentication.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label="Authentication Method"
                value="JWT (JSON Web Token)"
                description="The method used to authenticate API requests."
              />
              <Separator />
              <SettingRow
                label="Access Token Expiry"
                value="1 hour"
                description="How long an access token remains valid before requiring refresh."
              />
              <Separator />
              <SettingRow
                label="Refresh Token Expiry"
                value="7 days"
                description="How long a refresh token remains valid."
              />
              <Separator />
              <SettingRow
                label="Password Policy"
                value="Minimum 8 characters"
                description="Minimum password requirements for user accounts."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
