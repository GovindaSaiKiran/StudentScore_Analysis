from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Date,
    ForeignKey,
    Text,
    Boolean,
    Enum as SQLEnum,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship, relationship as orm_relationship
from sqlalchemy.sql import func
from datetime import datetime
from enum import Enum
from app.core.database import Base


class UserRole(str, Enum):
    PARENT = "parent"
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"


class AssessmentType(str, Enum):
    QUIZ = "quiz"
    EXAM = "exam"
    ASSIGNMENT = "assignment"
    PRACTICE = "practice"


class ActivityType(str, Enum):
    STUDY = "study"
    QUIZ = "quiz"
    REVISION = "revision"
    HOMEWORK = "homework"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.PARENT)
    language = Column(String(10), default="en")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    parent_children = relationship("ParentChild", back_populates="parent", foreign_keys="ParentChild.parent_id")
    student_profile = relationship("Student", back_populates="user", uselist=False)


class ParentChild(Base):
    __tablename__ = "parent_children"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    relationship = Column(String(50), default="parent")
    created_at = Column(DateTime, default=func.now())

    parent = orm_relationship("User", back_populates="parent_children", foreign_keys=[parent_id])
    student = orm_relationship("Student", back_populates="parent_links")

    __table_args__ = (UniqueConstraint("parent_id", "student_id", name="unique_parent_student"),)


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=True)
    student_code = Column(String(50), unique=True, index=True, nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    date_of_birth = Column(Date, nullable=True)
    grade = Column(String(20), nullable=True)
    section = Column(String(10), nullable=True)
    school_name = Column(String(255), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="student_profile")
    parent_links = relationship("ParentChild", back_populates="student")
    assessments = relationship("AssessmentResult", back_populates="student")
    quiz_attempts = relationship("QuizAttempt", back_populates="student")
    study_sessions = relationship("StudySession", back_populates="student")
    attendance_records = relationship("AttendanceRecord", back_populates="student")
    assignment_records = relationship("AssignmentRecord", back_populates="student")
    teacher_feedbacks = relationship("TeacherFeedback", back_populates="student")


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#3B82F6")
    created_at = Column(DateTime, default=func.now())

    topics = relationship("Topic", back_populates="subject")
    assessments = relationship("Assessment", back_populates="subject")
    quiz_attempts = relationship("QuizAttempt", back_populates="subject")


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    order_index = Column(Integer, default=0)
    prerequisite_topic_id = Column(Integer, ForeignKey("topics.id"), nullable=True)
    created_at = Column(DateTime, default=func.now())

    subject = relationship("Subject", back_populates="topics")
    quiz_attempts = relationship("QuizAttempt", back_populates="topic")
    prerequisite = relationship("Topic", remote_side=[id], backref="dependents")


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    assessment_type = Column(SQLEnum(AssessmentType), nullable=False)
    max_marks = Column(Float, nullable=False)
    weight = Column(Float, default=1.0)
    assessment_date = Column(Date, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())

    subject = relationship("Subject", back_populates="assessments")
    results = relationship("AssessmentResult", back_populates="assessment")
    topic_mappings = relationship("AssessmentTopicMapping", back_populates="assessment")


class AssessmentTopicMapping(Base):
    __tablename__ = "assessment_topic_mappings"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), nullable=False)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=False)
    marks_allocated = Column(Float, nullable=False)

    assessment = relationship("Assessment", back_populates="topic_mappings")
    topic = relationship("Topic")


class AssessmentResult(Base):
    __tablename__ = "assessment_results"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), nullable=False)
    marks_obtained = Column(Float, nullable=False)
    percentage = Column(Float, nullable=False)
    rank = Column(Integer, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())

    student = relationship("Student", back_populates="assessments")
    assessment = relationship("Assessment", back_populates="results")

    __table_args__ = (UniqueConstraint("student_id", "assessment_id", name="unique_student_assessment"),)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=False)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), nullable=True)
    score = Column(Float, nullable=False)
    max_score = Column(Float, nullable=False)
    percentage = Column(Float, nullable=False)
    time_taken_seconds = Column(Integer, nullable=True)
    attempt_date = Column(DateTime, default=func.now())
    notes = Column(Text, nullable=True)

    student = relationship("Student", back_populates="quiz_attempts")
    subject = relationship("Subject", back_populates="quiz_attempts")
    topic = relationship("Topic", back_populates="quiz_attempts")


class StudySession(Base):
    __tablename__ = "study_sessions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=True)
    activity_type = Column(SQLEnum(ActivityType), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    session_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    quiz_score = Column(Float, nullable=True)
    quiz_max_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=func.now())

    student = relationship("Student", back_populates="study_sessions")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False)
    period = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())

    student = relationship("Student", back_populates="attendance_records")

    __table_args__ = (UniqueConstraint("student_id", "date", "period", name="unique_student_attendance"),)


class AssignmentRecord(Base):
    __tablename__ = "assignment_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    assigned_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    submitted_date = Column(Date, nullable=True)
    status = Column(String(20), default="pending")
    score = Column(Float, nullable=True)
    max_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=func.now())

    student = relationship("Student", back_populates="assignment_records")


class TeacherFeedback(Base):
    __tablename__ = "teacher_feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True)
    teacher_name = Column(String(200), nullable=False)
    feedback_text = Column(Text, nullable=False)
    feedback_date = Column(Date, nullable=False)
    category = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=func.now())

    student = relationship("Student", back_populates="teacher_feedbacks")
    subject = relationship("Subject")


Index("ix_student_grade_section", Student.grade, Student.section)
Index("ix_assessment_date_type", Assessment.assessment_date, Assessment.assessment_type)
Index("ix_quiz_attempt_student_topic_date", QuizAttempt.student_id, QuizAttempt.topic_id, QuizAttempt.attempt_date)
Index("ix_study_session_student_date", StudySession.student_id, StudySession.session_date)