import type { ComponentProps } from "react";
import { useState } from "react";
import { MailIcon, SaveIcon } from "lucide-react";

import githubIconSvg from "@/assets/icons/footer/github.svg?raw";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSiteProfile } from "@/lib/admin/imports-client";
import {
  getStatusClass,
  type StatusMessage,
} from "@/lib/admin/imports-panel-feedback";
import { resolveErrorMessage } from "@/lib/http";
import {
  buildMailtoHref,
  resolveSiteProfile,
  type SiteProfile,
} from "@/lib/site-profile";
import {
  PUBLIC_FIELD_DISPLAY_CLASS,
  PUBLIC_PANEL_SURFACE_CLASS,
  PUBLIC_PANEL_SURFACE_SOFT_CLASS,
  PUBLIC_SECTION_SURFACE_STRONG_CLASS,
  PUBLIC_SURFACE_ACTION_CLASS,
} from "@/lib/ui-effects";

type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

const adminActionButtonClass =
  `${PUBLIC_SURFACE_ACTION_CLASS} min-h-11 justify-center self-start hover:border-sky-300/90 hover:text-sky-700 hover:shadow-[0_18px_40px_rgba(49,130,246,0.14)]`;

const INITIAL_STATUS: StatusMessage = {
  message: "footer 메일 버튼은 mailto:, GitHub 버튼은 입력한 URL로 연결됩니다.",
  state: "info",
};

type AdminSiteProfileSectionProps = {
  initialSiteProfile: SiteProfile;
};

export function AdminSiteProfileSection({
  initialSiteProfile,
}: AdminSiteProfileSectionProps) {
  const [siteProfile, setSiteProfile] = useState<SiteProfile>(initialSiteProfile);
  const [emailInput, setEmailInput] = useState(initialSiteProfile.email);
  const [githubUrlInput, setGithubUrlInput] = useState(initialSiteProfile.githubUrl);
  const [siteProfileBusy, setSiteProfileBusy] = useState(false);
  const [siteProfileStatus, setSiteProfileStatus] = useState<StatusMessage>(INITIAL_STATUS);

  async function handleSiteProfileSubmit(event: FormSubmitEvent) {
    event.preventDefault();

    const normalizedEmail = emailInput.trim();
    const normalizedGithubUrl = githubUrlInput.trim();
    if (!normalizedEmail || !normalizedGithubUrl) {
      setSiteProfileStatus({
        message: "메일 주소와 GitHub 주소를 모두 입력해 주세요.",
        state: "error",
      });
      return;
    }

    setSiteProfileBusy(true);
    setSiteProfileStatus({
      message: "footer 사용자 정보를 저장하는 중입니다...",
      state: "pending",
    });

    try {
      const { response, payload } = await updateSiteProfile(normalizedEmail, normalizedGithubUrl);
      if (!response.ok) {
        setSiteProfileStatus({
          message: resolveErrorMessage(payload, "footer 사용자 정보 저장에 실패했습니다."),
          state: "error",
        });
        return;
      }

      const nextSiteProfile = resolveSiteProfile(payload ?? {
        email: normalizedEmail,
        githubUrl: normalizedGithubUrl,
      });
      setSiteProfile(nextSiteProfile);
      setEmailInput(nextSiteProfile.email);
      setGithubUrlInput(nextSiteProfile.githubUrl);
      setSiteProfileStatus({
        message: "footer 사용자 정보를 저장했습니다.",
        state: "ok",
      });
    } catch {
      setSiteProfileStatus({
        message: "footer 사용자 정보 저장 중 네트워크 오류가 발생했습니다.",
        state: "error",
      });
    } finally {
      setSiteProfileBusy(false);
    }
  }

  const previewEmail = emailInput.trim() || siteProfile.email;
  const previewGithubUrl = githubUrlInput.trim() || siteProfile.githubUrl;

  return (
    <section
      aria-label="User Info 사용자 정보"
      className={`grid gap-5 p-5 sm:p-6 ${PUBLIC_SECTION_SURFACE_STRONG_CLASS}`}
      id="admin-site-profile-panel"
    >
      <div className={`grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-5 ${PUBLIC_PANEL_SURFACE_SOFT_CLASS}`}>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-100/90 text-sky-800 shadow-[0_12px_30px_rgba(56,189,248,0.16)]">
          <MailIcon className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            User Info
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            사용자 정보
          </h2>
          <p className="text-sm text-muted-foreground">
            footer 메일/GitHub 버튼에 연결되는 주소를 바로 수정할 수 있습니다.
          </p>
        </div>
      </div>

      <form className="grid gap-4" onSubmit={handleSiteProfileSubmit}>
        <div className="grid gap-4 xl:grid-cols-2">
          <section className={`grid gap-4 p-5 ${PUBLIC_PANEL_SURFACE_CLASS}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                  Email
                </p>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">
                  메일 주소
                </h3>
              </div>
              <Button asChild className={adminActionButtonClass} variant="outline">
                <a href={buildMailtoHref(previewEmail)}>
                  <MailIcon className="h-4 w-4" />
                  메일 열기
                </a>
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-site-profile-email">Footer 메일 주소</Label>
              <Input
                autoComplete="email"
                disabled={siteProfileBusy}
                id="admin-site-profile-email"
                onChange={(event) => setEmailInput(event.target.value)}
                required
                type="email"
                value={emailInput}
              />
            </div>
            <div className={`grid gap-2 ${PUBLIC_FIELD_DISPLAY_CLASS}`}>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Current
              </span>
              <span className="block truncate">{siteProfile.email}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {buildMailtoHref(previewEmail)}
              </span>
            </div>
          </section>

          <section className={`grid gap-4 p-5 ${PUBLIC_PANEL_SURFACE_CLASS}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                  GitHub
                </p>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">
                  GitHub 주소
                </h3>
              </div>
              <Button asChild className={adminActionButtonClass} variant="outline">
                <a
                  href={previewGithubUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 [&>svg]:h-4 [&>svg]:w-4"
                    dangerouslySetInnerHTML={{ __html: githubIconSvg }}
                  />
                  GitHub 열기
                </a>
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-site-profile-github">Footer GitHub 주소</Label>
              <Input
                autoComplete="url"
                disabled={siteProfileBusy}
                id="admin-site-profile-github"
                onChange={(event) => setGithubUrlInput(event.target.value)}
                required
                type="url"
                value={githubUrlInput}
              />
            </div>
            <div className={`grid gap-2 ${PUBLIC_FIELD_DISPLAY_CLASS}`}>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Current
              </span>
              <span className="block truncate">{siteProfile.githubUrl}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {previewGithubUrl}
              </span>
            </div>
          </section>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className={getStatusClass(siteProfileStatus.state)}>
            {siteProfileStatus.message}
          </div>
          <Button
            className={`${adminActionButtonClass} px-6`}
            disabled={siteProfileBusy}
            id="admin-site-profile-save"
            type="submit"
            variant="outline"
          >
            <SaveIcon className="h-4 w-4" />
            {siteProfileBusy ? "사용자 정보 저장 중..." : "사용자 정보 저장"}
          </Button>
        </div>
      </form>
    </section>
  );
}

export default AdminSiteProfileSection;
