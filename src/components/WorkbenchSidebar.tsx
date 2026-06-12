"use client";

import clsx from "clsx";
import { ProjectedTaxPositionCard } from "@/components/ProjectedTaxPositionCard";
import type { ProjectedTaxPosition } from "@/domain/types";

export function WorkbenchSidebar({
  sections,
  activeSection,
  activeSectionIndex,
  progress,
  position,
  hasData
}: {
  sections: ReadonlyArray<{ id: string; label: string }>;
  activeSection: string;
  activeSectionIndex: number;
  progress: number;
  position: ProjectedTaxPosition;
  hasData: boolean;
}) {
  return (
    <>
      <div className="brand">
        <div className="brand-mark">₦</div>
        <div>
          <div className="brand-name">Tax Workbench</div>
          <div className="brand-sub">Nigeria company review</div>
        </div>
      </div>

      <p className="nav-label">Your review</p>
      <nav className="nav">
        {sections.map((section, index) => (
          <a
            key={section.id}
            className={clsx(
              "nav-item",
              section.id === activeSection && "active",
              index < activeSectionIndex && "done"
            )}
            href={`#${section.id}`}
            aria-current={section.id === activeSection ? "true" : undefined}
          >
            <span className="nav-dot">{index + 1}</span>
            {section.label}
          </a>
        ))}
      </nav>

      <div className="progress-wrap">
        <div className="progress" aria-hidden="true">
          <div
            className="progress-fill"
            style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress / 100))})` }}
          />
        </div>
        <p className="progress-text">
          Step {activeSectionIndex + 1} of {sections.length}
        </p>
      </div>

      <ProjectedTaxPositionCard position={position} hasData={hasData} />
    </>
  );
}
