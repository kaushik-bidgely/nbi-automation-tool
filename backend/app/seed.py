"""
Loads real pilot data from the master sheet Kaushik shared
("Actions and Insights (Kaushik).xlsx") into the prototype DB as the MASTER
catalog, then clones it into a second "Demo Pilot" so pilot-switching can be
tested immediately without going through the Admin create-pilot flow first.

Run: python -m app.seed /path/to/Actions and Insights (Kaushik).xlsx
"""
import sys

from .auth import hash_password
from .database import Base, SessionLocal, engine
from . import models
from .sheet_import import import_actions, import_insights

# Default login accounts for the prototype — change/remove before any real deployment.
DEFAULT_USERS = [
    {"username": "admin", "password": "admin123", "role": "admin"},
    {"username": "tpm1", "password": "tpm123", "role": "tpm_csm"},
]


def _copy_row(model_cls, source_obj, pilot_id: int):
    """Builds a new detached ORM instance from source_obj's column values,
    excluding 'id' (so a fresh autoincrement id is assigned on insert)."""
    values = {
        col.name: getattr(source_obj, col.name)
        for col in model_cls.__table__.columns
        if col.name not in ("id", "pilot_id", "status", "created_at", "updated_at")
    }
    return model_cls(pilot_id=pilot_id, status="draft", **values)


def load(path: str):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    master = models.Pilot(code="MASTER", name="Master Catalog", is_master=True)
    db.add(master)
    db.flush()

    import_actions(db, path, master.id)
    import_insights(db, path, master.id)
    db.commit()

    demo = models.Pilot(code="DEMO", name="Demo Pilot", is_master=False)
    db.add(demo)
    db.flush()
    clone_pilot_content(db, master.id, demo.id)
    db.commit()

    for u in DEFAULT_USERS:
        db.add(models.User(username=u["username"], password_hash=hash_password(u["password"]), role=u["role"]))
    # A demo Utility account scoped to just the Demo pilot, Actions only, Paper channel only —
    # exercises the per-account scoping end to end out of the box.
    db.add(models.User(
        username="utility_demo", password_hash=hash_password("utility123"), role="utility",
        allowed_pilot_ids=[demo.id], content_scope="actions", channel_scope="paper",
    ))
    db.commit()

    print(f"Seeded MASTER: {db.query(models.ActionItem).filter_by(pilot_id=master.id).count()} actions, "
          f"{db.query(models.InsightItem).filter_by(pilot_id=master.id).count()} insights")
    print(f"Cloned DEMO pilot from MASTER: "
          f"{db.query(models.ActionItem).filter_by(pilot_id=demo.id).count()} actions, "
          f"{db.query(models.InsightItem).filter_by(pilot_id=demo.id).count()} insights")
    print("Login accounts: admin/admin123 (admin), tpm1/tpm123 (tpm_csm), "
          "utility_demo/utility123 (utility, Demo pilot, Actions+Paper only)")
    db.close()


def clone_pilot_content(db, source_pilot_id: int, target_pilot_id: int):
    """Copies all Action/Insight rows from one pilot to another — powers both
    the initial demo seed and the Admin 'Clone from Master' feature."""
    for action in db.query(models.ActionItem).filter_by(pilot_id=source_pilot_id).all():
        db.add(_copy_row(models.ActionItem, action, target_pilot_id))
    for insight in db.query(models.InsightItem).filter_by(pilot_id=source_pilot_id).all():
        db.add(_copy_row(models.InsightItem, insight, target_pilot_id))


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else \
        "/Users/sasikaushikbattul/Downloads/Actions and Insights (Kaushik).xlsx"
    load(path)
