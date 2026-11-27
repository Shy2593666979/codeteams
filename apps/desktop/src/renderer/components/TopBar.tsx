import React from "react";
import { Link, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Conversation, Project } from "@codeteams/shared";
import { rpc } from "../lib/bridge";

export const TopBar: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => rpc("projects.list", { includeArchived: false }),
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () => rpc("conversations.list", { includeArchived: false }),
  });

  const isWorkflowEditor =
    pathname === "/workflows/new" || /^\/workflows\/[^/]+$/.test(pathname);
  const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);
  const chatMatch = pathname.match(/^\/chat\/([^/]+)$/);

  const renderBreadcrumb = () => {
    if (isWorkflowEditor) {
      return (
        <>
          <Link to="/">{t("shell.workspace")}</Link>
          <span aria-hidden="true" className="text-[#94A3B8]">/</span>
          <Link to="/workflows">{t("nav.workflows")}</Link>
          <span aria-hidden="true" className="text-[#94A3B8]">/</span>
          <span className="ct-breadcrumb-current">{t("shell.editWorkflow")}</span>
        </>
      );
    }

    if (projectMatch) {
      const proj = projects.find((p) => p.id === projectMatch[1]);
      return (
        <>
          <Link to="/">{t("shell.workspace")}</Link>
          <span aria-hidden="true" className="text-[#94A3B8]">/</span>
          <span className="ct-breadcrumb-current">
            {proj?.name ?? t("shell.project")}
          </span>
        </>
      );
    }

    if (chatMatch) {
      const conv = conversations.find((c) => c.id === chatMatch[1]);
      const proj = conv
        ? projects.find((p) => p.id === conv.projectId)
        : undefined;
      return (
        <>
          {proj ? (
            <Link to={`/projects/${proj.id}`}>{proj.name}</Link>
          ) : (
            <Link to="/">{t("shell.workspace")}</Link>
          )}
          <span aria-hidden="true" className="text-[#94A3B8]">/</span>
          <span className="ct-breadcrumb-current">
            {conv?.title ?? t("shell.conversation")}
          </span>
        </>
      );
    }

    const title = pathname.startsWith("/workflows")
      ? t("nav.workflows")
      : pathname.startsWith("/agents")
        ? "Agents"
        : pathname.startsWith("/settings")
          ? t("nav.settings")
          : t("nav.newChat");

    return (
      <>
        <Link to="/">{t("shell.workspace")}</Link>
        <span aria-hidden="true" className="text-[#94A3B8]">/</span>
        <span className="ct-breadcrumb-current">{title}</span>
      </>
    );
  };

  return (
    <header className="ct-topbar">
      <nav aria-label={t("shell.breadcrumb")} className="ct-breadcrumb">
        {renderBreadcrumb()}
      </nav>
      <span className="ct-local-status">
        <span aria-hidden="true" />
        {t("shell.local")}
      </span>
    </header>
  );
};
