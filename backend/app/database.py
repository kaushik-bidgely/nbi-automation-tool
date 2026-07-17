import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Override for anywhere other than local dev — e.g. point this at a mounted
# persistent volume's path on a cloud host. Left as a bare relative-path
# SQLite file by default, the DB lives in the container's ephemeral
# filesystem and silently resets on every redeploy/restart.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./nbi_tool.db")

# check_same_thread is a sqlite3-specific DBAPI arg — only pass it for a
# sqlite:// URL so DATABASE_URL can't be pointed at a non-SQLite database
# without this blowing up on an unrecognized connect arg.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
