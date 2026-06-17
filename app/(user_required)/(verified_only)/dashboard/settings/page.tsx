"use client";

import PasswordSettingsPanel from "./password-settings-panel";
import TwoFactorSettingsPanel from "./two-factor-settings-panel";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function SettingsPage() {
  return (
    <div className="w-full p-4 pt-0 md:p-6">
      <div className="space-y-6">
        <Tabs defaultValue="password" className="w-full">
          <TabsList>
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="two-factor">Two-Factor Authentication</TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="mt-6">
            <PasswordSettingsPanel />
          </TabsContent>

          <TabsContent value="two-factor" className="mt-6">
            <TwoFactorSettingsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
