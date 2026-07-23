from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, JSON, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import Base


class Pilot(Base):
    __tablename__ = "pilots"

    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    is_master = Column(Boolean, default=False)  # the global catalog other pilots clone from
    created_at = Column(DateTime, default=datetime.utcnow)

    actions = relationship("ActionItem", back_populates="pilot", cascade="all, delete-orphan")
    insights = relationship("InsightItem", back_populates="pilot", cascade="all, delete-orphan")

    # Powers the nav bar's per-pilot "hide this tab if empty" behavior (App.tsx) —
    # simple len() over the relationship rather than a COUNT query, since pilot
    # counts and per-pilot row counts are both small at this app's scale.
    @property
    def action_count(self) -> int:
        return len(self.actions)

    @property
    def insight_count(self) -> int:
        return len(self.insights)

    @property
    def interaction_count(self) -> int:
        return len(self.interaction_records)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin | tpm_csm | utility

    # Only enforced for role == "utility". Internal roles (admin, tpm_csm) see
    # every pilot / both content types / both channels — this scoping exists
    # specifically to give a utility contact a narrow, per-account view.
    allowed_pilot_ids = Column(JSON, default=list)
    content_scope = Column(String, default="both")   # actions | insights | both
    channel_scope = Column(String, default="both")   # email | paper | both

    created_at = Column(DateTime, default=datetime.utcnow)


class Session(Base):
    __tablename__ = "sessions"

    token = Column(String, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ActionItem(Base):
    __tablename__ = "action_items"
    __table_args__ = (UniqueConstraint("pilot_id", "action_id", name="uq_action_pilot_actionid"),)

    id = Column(Integer, primary_key=True)
    pilot_id = Column(Integer, ForeignKey("pilots.id"), nullable=False)
    action_id = Column(String, nullable=False)  # e.g. T-E-AC-001

    # Identity / Classification. Permission per role: see rbac_matrix.py (category=internal).
    nbi_family = Column(String)
    nbi_type = Column(String)
    fuel_type = Column(String)
    appliance = Column(String)

    # channels/cta_link: category=internal (admin edit, tpm_csm view, utility
    # none) in rbac_matrix.py. description/footer_disclaimer: category=content
    # (admin+tpm_csm edit, utility view, email channel) — NOT admin-only,
    # despite living in this "internal-sounding" group; the grouping here is by
    # sheet-column origin, not by permission.
    description = Column(Text)
    footer_disclaimer = Column(Text)
    channels = Column(String)
    icon_url = Column(String)
    image_paper_url = Column(String)
    image_email_url = Column(String)
    cta_link = Column(String)

    # User-editable content — matches the "[utility input]" columns in the master sheet.
    # Permission per role: see rbac_matrix.py (category=content).
    short_desc = Column(String)          # max 110 chars
    title = Column(String)               # max 55 chars
    subject_line_email = Column(String)
    subject_title_paper = Column(String)
    cta_text = Column(String)
    cta_link_name = Column(String)

    # Filters, high blast radius if wrong. Permission per role: see rbac_matrix.py (category=internal).
    utility_objectives = Column(String)
    filter_ownership = Column(String)
    filter_season = Column(String)

    # Structured tag fields — the actual source of truth. tag_string below is
    # GENERATED from these on every save (see tag_logic.build_tag_string) so
    # it can never drift out of sync the way free-text editing allowed.
    # Permission per role: see rbac_matrix.py (category=internal).
    reco_type = Column(String)                  # edu | prod | prog | tip
    benefit_scale = Column(String)               # b_no | b_low | b_med | b_high
    cost_scale = Column(String)                  # c_no | c_low | c_med | c_high
    effort_scale = Column(String)                # e_no | e_low | e_med | e_high
    diy = Column(Boolean, default=False)
    selfie = Column(Boolean, default=False)
    income_level = Column(JSON, default=list)     # subset of [inc_low, inc_med, inc_high]
    ownership = Column(JSON, default=list)        # subset of [owner, renter]
    season = Column(JSON, default=list)           # subset of [pre_summer, peak_summer, ...]
    persona = Column(JSON, default=list)          # subset of [tou, green]
    strike_low = Column(Integer, nullable=True)
    strike_high = Column(Integer, nullable=True)

    # Generated, read-only from the API's perspective (edit blocked for every
    # role, see main.py) — kept for the legacy CSV/SQL export step (Script 2)
    # which expects this exact pipe-delimited format. category=generated.
    tag_string = Column(Text)
    extra_tags = Column(String)  # category=internal — free-text escape hatch for the long tail

    # QA/publish lifecycle (2026-07-06) — fully independent of the Merge/
    # Interaction concept below: whether an item is merged with a pairing is
    # tracked separately (see `merged` property), not folded into this field.
    # draft -> ready_for_qa (any role) -> published (Admin only, via bulk
    # publish/export) -> modified (auto on Unlock, itself Admin/tpm_csm only,
    # required before a Published item can be edited) -> back to ready_for_qa.
    status = Column(String, default="draft")  # draft | ready_for_qa | published | modified
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pilot = relationship("Pilot", back_populates="actions")

    @property
    def merged(self) -> bool:
        """Whether this action is paired with an insight via an InteractionRecord.
        Computed, not stored — merge state is independent of the QA/publish status above."""
        return bool(self.interactions)


class InsightItem(Base):
    __tablename__ = "insight_items"
    __table_args__ = (UniqueConstraint("pilot_id", "insight_id", name="uq_insight_pilot_insightid"),)

    id = Column(Integer, primary_key=True)
    pilot_id = Column(Integer, ForeignKey("pilots.id"), nullable=False)
    insight_id = Column(String, nullable=False)  # e.g. I_AC_01

    # Identity. Permission per role: see rbac_matrix.py (category=internal;
    # appliance is the one exception kept utility-visible for context).
    appliance = Column(String)
    fuel_type = Column(String)
    channel = Column(String)
    variable_name = Column(String)

    # Content — channel-split per the sheet's own row-4 annotations (email:
    # subject_line + insight_text; paper: insight_semantic + paper_text).
    # category=content in rbac_matrix.py: admin+tpm_csm edit, utility view.
    insight_semantic = Column(Text)      # max 135 chars — paper
    paper_text = Column(Text)            # paper
    subject_line = Column(String)        # email
    insight_text = Column(Text)          # email

    icon_url = Column(String)            # category=image (admin+tpm_csm edit, utility view) — previewed but no dimension spec in the sheet

    # Structured tag fields — same rationale as ActionItem: tag_string is
    # GENERATED from these, never hand-edited. Scoped to the core, commonly-used
    # categories from the sheet's 102-column tag vocabulary; the long tail
    # (per-month/weekday flags, event-date markers, gas-user-segment, etc.)
    # stays in extra_tags as free text, same escape hatch Actions already has.
    # Permission per role: see rbac_matrix.py (category=internal).
    comparison_type = Column(String)             # peer | self | rate | behav
    direction = Column(String)                   # neg | neu | pos
    data_source = Column(String)                 # bill_amt | high_usage | pk_consumption
    season = Column(JSON, default=list)          # subset of [summer, winter]
    tou_period = Column(JSON, default=list)      # subset of [peak, mid_peak, off_peak, all]
    generic_insight = Column(Boolean, default=False)
    generic_insight_type = Column(String)        # welcome | edu_tip | feature | seasonal | feel_good | green
    challenge_status = Column(String)            # bad | good
    min_value = Column(Integer, nullable=True)
    max_value = Column(Integer, nullable=True)

    tag_string = Column(Text)   # generated, see tag_logic.build_insight_tag_string — category=generated
    extra_tags = Column(String)  # category=internal — free-text escape hatch for the long tail

    status = Column(String, default="draft")  # draft | ready_for_qa | published | modified — see ActionItem.status
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pilot = relationship("Pilot", back_populates="insights")

    @property
    def merged(self) -> bool:
        return bool(self.interactions)


class InteractionRecord(Base):
    """An Action + Insight pairing merged by Admin — replaces manual Script 1."""

    __tablename__ = "interaction_records"

    id = Column(Integer, primary_key=True)
    pilot_id = Column(Integer, ForeignKey("pilots.id"), nullable=False)
    action_item_id = Column(Integer, ForeignKey("action_items.id"), nullable=False)
    insight_item_id = Column(Integer, ForeignKey("insight_items.id"), nullable=False)

    # Same 4-stage lifecycle as ActionItem/InsightItem (2026-07-22) — replaces
    # the earlier merged/exported status, which only tracked whether a CSV had
    # ever been pulled, not a real QA state. Existing rows were migrated to
    # "draft" as a one-time backfill.
    status = Column(String, default="draft")  # draft | ready_for_qa | published | modified
    export_payload = Column(Text)  # CSV/JSON snapshot generated at merge time
    created_by_role = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Per-interaction overrides for the 3 fields the PE config sheet treats as
    # editable at the pairing level (interaction_logic.compute_fields falls
    # back to the source Action/Insight's own field when these are unset) —
    # editing them here does NOT touch the shared Action/Insight record.
    action_text_override = Column(Text)
    insight_semantic_override = Column(Text)
    insight_text_override = Column(Text)

    # Set when this interaction represents the synthetic "seasonal" variant of
    # action_item (ac/sh appliance actions get a Summer/Winter Seasonal or
    # Program counterpart per generate_nbi_configs.py's add_seasonal_actions) —
    # None for a regular pairing. Lets one real ActionItem back two distinct
    # InteractionRecords (base + seasonal) without a second DB row.
    seasonal_suffix = Column(String, nullable=True)  # None | "S" | "W"

    pilot = relationship("Pilot", backref="interaction_records")
    # backref creates .interactions on ActionItem/InsightItem — the basis for
    # the computed `merged` property on each, so merge state is queryable
    # without a stored, driftable status value.
    action_item = relationship("ActionItem", foreign_keys=[action_item_id], backref="interactions")
    insight_item = relationship("InsightItem", foreign_keys=[insight_item_id], backref="interactions")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String, nullable=False)  # action_item | insight_item | interaction_record
    entity_id = Column(Integer, nullable=False)
    field = Column(String)
    old_value = Column(Text)
    new_value = Column(Text)
    changed_by_role = Column(String)  # user | admin
    changed_at = Column(DateTime, default=datetime.utcnow)
