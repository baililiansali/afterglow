import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/afterglow";
import { useAuth } from "@/lib/auth";
import { initials, useMyProfile } from "@/lib/avatar";
import { useNavigate } from "@tanstack/react-router";
import { AdminShell, useAdminRes, useAdminOrders } from "@/components/admin/AdminShell";
import { PageHeader, RequireAuth } from "@/components/SiteChrome";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Account — Afterglow" },
      { name: "description", content: "View your Afterglow account details and booking activity." },
      { property: "og:title", content: "My Account — Afterglow" },
      { property: "og:description", content: "View your Afterglow account details." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileLayout />
    </RequireAuth>
  );
}

function ProfileLayout() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminProfileLayout /> : <Profile />;
}

function AdminProfileLayout() {
  const res = useAdminRes();
  const orders = useAdminOrders();
  const navigate = useNavigate();
  return (
    <AdminShell
      section={null}
      title="My Account"
      onSection={(s) => navigate({ to: "/admin", search: { section: s } })}
      res={res}
      orders={orders}
    >
      <div className="mx-auto max-w-2xl">
        <Profile />
      </div>
    </AdminShell>
  );
}

function Profile() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useMyProfile(user?.id);
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const name = `${firstName.trim()} ${lastName.trim()}`.trim();
  const setName = (full: string) => {
    const parts = full.trim().split(/\s+/);
    setLastName(parts.length > 1 ? parts.pop()! : "");
    setFirstName(parts.join(" "));
  };
  const [phone, setPhone] = useState("");
  const [isEditing, setIsEditing] = useState(false); 
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  
  // New state to hold the photo file until "Save changes" is clicked
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removePhotoFlag, setRemovePhotoFlag] = useState(false);

  useEffect(() => {
    setName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile?.full_name, profile?.phone]);
  useEffect(() => setEmail(user?.email ?? ""), [user?.email]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-profile", user?.id] });

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return void toast.error("Please choose an image.");
    if (file.size > 5 * 1024 * 1024) return void toast.error("Image must be under 5 MB.");
    
    setNewPhotoFile(file);
    setRemovePhotoFlag(false);
    // Create a temporary local URL for preview
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemovePhoto = () => {
    setNewPhotoFile(null);
    setPreviewUrl(null);
    setRemovePhotoFlag(true);
  };

  const save = async () => {
    if (name.trim().length > 100 || phone.trim().length > 30)
      return void toast.error("Name or phone is too long.");
    const newEmail = email.trim();
    const emailChanged = !!newEmail && newEmail !== user?.email;
    if (pw || pw2) {
      if (pw.length < 6) return void toast.error("Password must be at least 6 characters.");
      if (pw !== pw2) return void toast.error("Passwords do not match.");
    }
    
    setSaving(true);
    if (emailChanged || pw) {
      const { error: authErr } = await supabase.auth.updateUser(
        { ...(emailChanged ? { email: newEmail } : {}), ...(pw ? { password: pw } : {}) },
        { emailRedirectTo: window.location.origin },
      );
      if (authErr) {
        setSaving(false);
        return void toast.error(authErr.message);
      }
      if (emailChanged) toast.success("Check your new email to confirm the change.");
      if (pw) toast.success("Password updated");
      setPw(""); setPw2("");
    }
    let finalAvatarUrl = profile?.avatar_url ?? null;

    // 1. Handle photo removal if flagged
    if (removePhotoFlag && profile?.avatar_url) {
      await supabase.storage.from("avatars").remove([profile.avatar_url]);
      finalAvatarUrl = null;
    }

    // 2. Handle new photo upload if selected
    if (newPhotoFile) {
      const ext = newPhotoFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user!.id}/avatar-${Date.now()}.${ext}`;
      
      const up = await supabase.storage
        .from("avatars")
        .upload(path, newPhotoFile, { upsert: true, contentType: newPhotoFile.type });
      
      if (up.error) {
        setSaving(false);
        return void toast.error("Photo upload failed.");
      }

      // Delete the old photo if it exists
      if (profile?.avatar_url) {
        await supabase.storage.from("avatars").remove([profile.avatar_url]);
      }
      finalAvatarUrl = path;
    }

    // 3. Update the profile record
    const { data, error } = await supabase
      .from("profiles")
      .update({ 
        full_name: name.trim() || null, 
        phone: phone.trim() || null,
        avatar_url: finalAvatarUrl
      })
      .eq("id", user!.id)
      .select();

    setSaving(false);
    if (error || !data?.length) return void toast.error("Could not save your profile.");
    
    toast.success("Profile saved");
    setIsEditing(false);
    setNewPhotoFile(null);
    setPreviewUrl(null);
    setRemovePhotoFlag(false);
    refresh();
  };

  const cancelEdit = () => {
    setName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setEmail(user?.email ?? "");
    setPw(""); setPw2("");
    setIsEditing(false);
    // Discard photo changes
    setNewPhotoFile(null);
    setPreviewUrl(null);
    setRemovePhotoFlag(false);
  };


  // Determine which image to show (local preview, existing, or fallback)
  const displayPhoto = previewUrl || (removePhotoFlag ? null : profile?.photo);

  const content = (
    <div>
      {!isAdmin && <PageHeader eyebrow="Account" title="My account" />}
      <div className="mx-auto max-w-2xl space-y-5 px-4">
        <div className="rounded-2xl border border-border bg-card p-6 glow-primary">
          <div className="flex flex-wrap items-center gap-5">
            <Avatar className="h-20 w-20 border-2 border-primary/60">
              {displayPhoto && <AvatarImage src={displayPhoto} alt="Profile photo" />}
              <AvatarFallback className="bg-secondary text-xl font-bold">
                {initials(profile?.full_name, user?.email)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <p className="font-display text-2xl font-bold">{profile?.full_name || "Guest"}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              
              {isEditing && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <label className="cursor-pointer">
                      <Camera className="mr-1 h-4 w-4" />
                      Change photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileSelect(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </Button>
                  {(profile?.avatar_url || newPhotoFile) && (
                    <Button size="sm" variant="ghost" onClick={handleRemovePhoto}>
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-first">First name</Label>
              <Input
                id="pf-first"
                autoComplete="off"
                value={firstName}
                maxLength={50}
                disabled={!isEditing}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-last">Last name</Label>
              <Input
                id="pf-last"
                autoComplete="off"
                value={lastName}
                maxLength={50}
                disabled={!isEditing}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-phone">Phone</Label>
              <Input
                id="pf-phone"
                autoComplete="off"
                value={phone}
                maxLength={30}
                disabled={!isEditing}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-email">Email</Label>
              <Input id="pf-email" type="email" autoComplete="off" value={email} disabled={!isEditing} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-pw">New password</Label>
              <Input id="pf-pw" type="password" autoComplete="new-password" placeholder={isEditing ? "Leave blank to keep" : "••••••••"} value={pw} disabled={!isEditing} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-pw2">Confirm password</Label>
              <Input id="pf-pw2" type="password" autoComplete="new-password" value={pw2} disabled={!isEditing} onChange={(e) => setPw2(e.target.value)} />
            </div>
          </div>
          
          <p className="mt-3 text-xs text-muted-foreground">
            Member since: {profile?.created_at ? fmtDate(profile.created_at.slice(0, 10)) : "—"}
            {isAdmin && <span className="ml-2 text-accent">· Admin access</span>}
          </p>
          
          <div className="mt-5 flex flex-wrap gap-2">
            {!isEditing ? (
              <Button type="button" variant="glow" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            ) : (
              <>
                <Button type="button" variant="glow" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="ghost" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  return content;
}