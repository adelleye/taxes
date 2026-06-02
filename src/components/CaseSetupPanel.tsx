"use client";

import { Checkbox } from "@base-ui-components/react/checkbox";
import { Check } from "lucide-react";
import { Card } from "@/components/Card";
import { Select } from "@/components/ui/Select";
import type { BusinessProfile } from "@/domain/types";
import { TURNOVER_OPTIONS } from "@/domain/options";

interface CaseSetupPanelProps {
  profile: BusinessProfile;
  onProfileChange: (profile: BusinessProfile) => void;
}

export function CaseSetupPanel({ profile, onProfileChange }: CaseSetupPanelProps) {
  const updateProfile = <Key extends keyof BusinessProfile>(
    key: Key,
    value: BusinessProfile[Key]
  ) => {
    onProfileChange({ ...profile, [key]: value });
  };

  const errors = {
    legalName: profile.legalName.trim() === "",
    rcNumber: profile.rcNumber.trim() === "",
    taxId: profile.taxId.trim() === ""
  };

  return (
    <Card>
      <form className="panel-pad" onSubmit={(event) => event.preventDefault()} noValidate>
        <div className="field-grid">
          <div className="field">
            <label className="field-label" htmlFor="legalName">
              Legal name
            </label>
            <input
              id="legalName"
              className="input"
              value={profile.legalName}
              onChange={(event) => updateProfile("legalName", event.target.value)}
              autoComplete="organization"
              spellCheck={false}
              required
              aria-invalid={errors.legalName}
              aria-describedby={errors.legalName ? "legalName-error" : undefined}
            />
            {errors.legalName ? (
              <p className="field-error" id="legalName-error">
                Enter the company&rsquo;s registered name.
              </p>
            ) : null}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="rcNumber">
              CAC / RC number
            </label>
            <input
              id="rcNumber"
              className="input"
              value={profile.rcNumber}
              onChange={(event) => updateProfile("rcNumber", event.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              aria-invalid={errors.rcNumber}
              aria-describedby={errors.rcNumber ? "rcNumber-error" : undefined}
            />
            {errors.rcNumber ? (
              <p className="field-error" id="rcNumber-error">
                Enter the CAC/RC number.
              </p>
            ) : null}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="taxId">
              Tax ID
            </label>
            <input
              id="taxId"
              className="input"
              value={profile.taxId}
              onChange={(event) => updateProfile("taxId", event.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              aria-invalid={errors.taxId}
              aria-describedby={errors.taxId ? "taxId-error" : undefined}
            />
            {errors.taxId ? (
              <p className="field-error" id="taxId-error">
                Enter the Tax ID (TIN).
              </p>
            ) : null}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="state">
              State
            </label>
            <input
              id="state"
              className="input"
              value={profile.state}
              onChange={(event) => updateProfile("state", event.target.value)}
              autoComplete="address-level1"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="industry">
              Industry
            </label>
            <input
              id="industry"
              className="input"
              value={profile.industry}
              onChange={(event) => updateProfile("industry", event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <span className="field-label">Turnover band</span>
            <Select
              className="select-input"
              ariaLabel="Turnover band"
              value={profile.turnoverBand}
              onValueChange={(value) => updateProfile("turnoverBand", value)}
              items={TURNOVER_OPTIONS}
            />
          </div>
        </div>

        <div className="toggle-row">
          <Toggle
            label="VAT registered"
            checked={profile.vatRegistered}
            onChange={(checked) => updateProfile("vatRegistered", checked)}
          />
          <Toggle
            label="Has employees"
            checked={profile.hasEmployees}
            onChange={(checked) => updateProfile("hasEmployees", checked)}
          />
        </div>

        <p className="form-foot">
          These details shape the review only — nothing is filed. Load the statement from the panel
          above.
        </p>
      </form>
    </Card>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox.Root
      className="toggle"
      checked={checked}
      onCheckedChange={(value) => onChange(value === true)}
    >
      <span>{label}</span>
      <span className="check" aria-hidden="true">
        <Checkbox.Indicator keepMounted>
          <Check strokeWidth={3} />
        </Checkbox.Indicator>
      </span>
    </Checkbox.Root>
  );
}
