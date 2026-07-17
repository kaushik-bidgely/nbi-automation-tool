from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class PilotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    is_master: bool


class PilotCreateIn(BaseModel):
    code: str
    name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    allowed_pilot_ids: list[int] = []
    content_scope: str
    channel_scope: str
    created_at: datetime


class UserCreateIn(BaseModel):
    username: str
    password: str = Field(min_length=8)
    role: str  # admin | tpm_csm | utility
    allowed_pilot_ids: list[int] = []
    content_scope: str = "both"
    channel_scope: str = "both"


class UserUpdateIn(BaseModel):
    role: str | None = None
    password: str | None = Field(default=None, min_length=8)
    allowed_pilot_ids: list[int] | None = None
    content_scope: str | None = None
    channel_scope: str | None = None


class LoginIn(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    token: str
    user: UserOut


class ActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pilot_id: int
    action_id: str
    nbi_family: str | None = None
    nbi_type: str | None = None
    fuel_type: str | None = None
    appliance: str | None = None
    description: str | None = None
    footer_disclaimer: str | None = None
    channels: str | None = None
    icon_url: str | None = None
    image_paper_url: str | None = None
    image_email_url: str | None = None
    cta_link: str | None = None
    short_desc: str | None = None
    title: str | None = None
    subject_line_email: str | None = None
    subject_title_paper: str | None = None
    cta_text: str | None = None
    cta_link_name: str | None = None
    utility_objectives: str | None = None
    filter_ownership: str | None = None
    filter_season: str | None = None
    reco_type: str | None = None
    benefit_scale: str | None = None
    cost_scale: str | None = None
    effort_scale: str | None = None
    diy: bool = False
    selfie: bool = False
    income_level: list[str] = []
    ownership: list[str] = []
    season: list[str] = []
    persona: list[str] = []
    strike_low: int | None = None
    strike_high: int | None = None
    tag_string: str | None = None
    extra_tags: str | None = None
    status: str
    merged: bool = False
    updated_at: datetime


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pilot_id: int
    insight_id: str
    appliance: str | None = None
    fuel_type: str | None = None
    channel: str | None = None
    variable_name: str | None = None
    insight_semantic: str | None = None
    subject_line: str | None = None
    icon_url: str | None = None
    insight_text: str | None = None
    paper_text: str | None = None
    comparison_type: str | None = None
    direction: str | None = None
    data_source: str | None = None
    season: list[str] = []
    tou_period: list[str] = []
    generic_insight: bool = False
    generic_insight_type: str | None = None
    challenge_status: str | None = None
    min_value: int | None = None
    max_value: int | None = None
    tag_string: str | None = None
    extra_tags: str | None = None
    status: str
    merged: bool = False
    updated_at: datetime


class UpdateFieldsIn(BaseModel):
    fields: dict


class PublishIn(BaseModel):
    ids: list[int]


class PublishOut(BaseModel):
    filename: str
    csv: str
    published_ids: list[int]
    skipped_ids: list[int]


class InteractionCreateIn(BaseModel):
    action_item_id: int
    insight_item_id: int


class InteractionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pilot_id: int
    action_item_id: int
    insight_item_id: int
    status: str
    export_payload: str | None = None
    created_by_role: str | None = None
    created_at: datetime


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_type: str
    entity_id: int
    field: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    changed_by_role: str | None = None
    changed_at: datetime
