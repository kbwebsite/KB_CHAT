"""Wave 4C dataset seeding (synthetic only, disposable benchmark PG).

S: 50 users, ~20 convs, ~400 msgs, 50 statuses, 1 community, 3 channels/30 posts.
M: 300 users, ~100 convs, one 2k-member group, one 10k-msg group, 500 statuses.
Uses one shared bcrypt hash (auth cost is not under test here).
"""

import sys
import time

from common import bench_pg_url, require_pg_engine

engine, Base = require_pg_engine()

from app.auth.security import hash_password
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.status import Status
from app.models.community import Community, CommunityGroup
from app.models.channel import Channel, ChannelPost
from sqlalchemy.orm import Session

PW = hash_password("benchpass123")


def wipe(db):
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()


def mkusers(db, n, tag):
    users = []
    for i in range(n):
        u = User(
            username=f"{tag}u{i:04d}",
            email=f"{tag}u{i:04d}@bench.test",
            display_name=f"Bench {i}",
            hashed_password=PW,
            email_verified=True,
        )
        db.add(u)
    db.commit()
    return [u.id for u in db.query(User).filter(User.username.like(f"{tag}u%")).all()]


def mkconv(db, uids, title, is_group=True, creator=None):
    c = Conversation(is_group=is_group, title=title, created_by=creator or uids[0])
    db.add(c)
    db.flush()
    for uid in uids:
        db.add(ConversationMember(conversation_id=c.id, user_id=uid, role="member"))
    db.commit()
    return c.id


def mkmsgs(db, cid, sid, n, prefix="msg"):
    db.bulk_save_objects(
        [
            Message(conversation_id=cid, sender_id=sid, content=f"{prefix} {i}")
            for i in range(n)
        ]
    )
    db.commit()


def seed(which: str):
    t0 = time.perf_counter()
    db = Session(bind=engine)
    try:
        wipe(db)
        if which == "S":
            uids = mkusers(db, 50, "s")
            for i in range(20):
                cid = mkconv(db, uids[i : i + 5] or uids[:5], f"s-group-{i}")
                mkmsgs(db, cid, uids[i % 50], 20, prefix=f"s{i}")
            for i in range(50):
                db.add(Status(user_id=uids[i % 50], content=f"status {i}"))
            db.commit()
            c = Community(owner_id=uids[0], name="s-comm")
            db.add(c)
            db.flush()
            for _ in range(3):
                ch = Channel(owner_id=uids[0], name="s-chan")
                db.add(ch)
                db.flush()
                for i in range(10):
                    db.add(
                        ChannelPost(
                            channel_id=ch.id, sender_id=uids[0], content=f"post {i}"
                        )
                    )
            db.commit()
        elif which == "M":
            uids = mkusers(db, 500, "m")
            for i in range(100):
                cid = mkconv(db, uids[i : i + 4] or uids[:4], f"m-group-{i}")
                mkmsgs(db, cid, uids[i % 500], 20, prefix=f"m{i}")
            big = mkconv(db, uids, "m-big", creator=uids[0])
            mkmsgs(db, big, uids[0], 10000, prefix="big")
            for i in range(500):
                db.add(Status(user_id=uids[i % 500], content=f"status {i}"))
            db.commit()
        from sqlalchemy import func, text as _text

        out = {}
        for t in Base.metadata.sorted_tables:
            try:
                out[t.name] = db.execute(
                    _text(f'SELECT COUNT(*) FROM "{t.name}"')
                ).scalar()
            except Exception:
                pass
        dt = round(time.perf_counter() - t0, 1)
        print(f"dataset={which} seed_seconds={dt}")
        for k in (
            "users",
            "conversations",
            "conversation_members",
            "messages",
            "statuses",
            "communities",
            "channels",
            "channel_posts",
        ):
            print(f"  {k}: {out.get(k)}")
    finally:
        db.close()


if __name__ == "__main__":
    seed(sys.argv[1] if len(sys.argv) > 1 else "S")
