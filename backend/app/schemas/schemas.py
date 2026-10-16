from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import date, datetime
from enum import Enum
from app.models.models import UserRole, AssessmentType, ActivityType


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.PARENT
    language: str = "en"


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    language: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    email: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[UserRole] = None


class StudentBase(BaseModel):
    student_code: str
    first_name: str
    last_name: str
    date_of_birth: Optional[date] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    school_name: Optional[str] = None
    avatar_url: Optional[str] = None


class StudentCreate(StudentBase):
    pass


class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    grade: Optional[str] = None
    section: Optional[str] = None
    school_name: Optional[str] = None
    avatar_url: Optional[str] = None


class StudentResponse(StudentBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubjectBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    color: str = "#3B82F6"


class SubjectCreate(SubjectBase):
    pass


class SubjectResponse(SubjectBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class TopicBase(BaseModel):
    subject_id: int
    name: str
    description: Optional[str] = None
    order_index: int = 0
    prerequisite_topic_id: Optional[int] = None


class TopicCreate(TopicBase):
    pass


class TopicResponse(TopicBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AssessmentBase(BaseModel):
    subject_id: int
    name: str
    assessment_type: AssessmentType
    max_marks: float = Field(..., gt=0)
    weight: float = Field(1.0, gt=0)
    assessment_date: date
    description: Optional[str] = None


class AssessmentCreate(AssessmentBase):
    topic_mappings: Optional[List[dict]] = None


class AssessmentResponse(AssessmentBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AssessmentResultBase(BaseModel):
    student_id: int
    assessment_id: int
    marks_obtained: float = Field(..., ge=0)
    remarks: Optional[str] = None


class AssessmentResultCreate(AssessmentResultBase):
    @validator("marks_obtained")
    def validate_marks(cls, v, values):
        return v


class AssessmentResultResponse(AssessmentResultBase):
    id: int
    percentage: float
    rank: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class QuizAttemptBase(BaseModel):
    student_id: int
    subject_id: int
    topic_id: int
    assessment_id: Optional[int] = None
    score: float = Field(..., ge=0)
    max_score: float = Field(..., gt=0)
    time_taken_seconds: Optional[int] = None
    notes: Optional[str] = None


class QuizAttemptCreate(QuizAttemptBase):
    @validator("score")
    def validate_score(cls, v, values):
        if "max_score" in values and v > values["max_score"]:
            raise ValueError("Score cannot exceed max_score")
        return v


class QuizAttemptResponse(QuizAttemptBase):
    id: int
    percentage: float
    attempt_date: datetime

    class Config:
        from_attributes = True


class StudySessionBase(BaseModel):
    student_id: int
    subject_id: Optional[int] = None
    topic_id: Optional[int] = None
    activity_type: ActivityType
    duration_minutes: int = Field(..., gt=0)
    session_date: date
    notes: Optional[str] = None
    quiz_score: Optional[float] = None
    quiz_max_score: Optional[float] = None


class StudySessionCreate(StudySessionBase):
    pass


class StudySessionResponse(StudySessionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AttendanceRecordBase(BaseModel):
    student_id: int
    date: date
    status: str
    period: Optional[str] = None
    notes: Optional[str] = None


class AttendanceRecordCreate(AttendanceRecordBase):
    pass


class AttendanceRecordResponse(AttendanceRecordBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AssignmentRecordBase(BaseModel):
    student_id: int
    subject_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    assigned_date: date
    due_date: date
    submitted_date: Optional[date] = None
    status: str = "pending"
    score: Optional[float] = None
    max_score: Optional[float] = None


class AssignmentRecordCreate(AssignmentRecordBase):
    pass


class AssignmentRecordResponse(AssignmentRecordBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class TeacherFeedbackBase(BaseModel):
    student_id: int
    subject_id: Optional[int] = None
    teacher_name: str
    feedback_text: str
    feedback_date: date
    category: Optional[str] = None


class TeacherFeedbackCreate(TeacherFeedbackBase):
    pass


class TeacherFeedbackResponse(TeacherFeedbackBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ParentChildLink(BaseModel):
    parent_id: int
    student_id: int
    relationship: str = "parent"


# Dashboard schemas
class SubjectPerformance(BaseModel):
    subject_id: int
    subject_name: str
    subject_code: str
    average_percentage: float
    latest_score: Optional[float] = None
    trend: str
    total_assessments: int
    color: str


class TopicPerformance(BaseModel):
    topic_id: int
    topic_name: str
    subject_id: int
    subject_name: str
    average_percentage: float
    latest_score: Optional[float] = None
    trend: str
    attempts_count: int
    needs_practice: bool


class AttendanceSummary(BaseModel):
    total_days: int
    present_days: int
    absent_days: int
    late_days: int
    attendance_percentage: float
    trend: str


class AssignmentSummary(BaseModel):
    total_assignments: int
    completed: int
    pending: int
    overdue: int
    completion_rate: float


class MarksTrend(BaseModel):
    assessment_name: str
    assessment_date: date
    subject_name: str
    percentage: float
    marks_obtained: float
    max_marks: float


class ParentDashboardSummary(BaseModel):
    student: StudentResponse
    overall_average: float
    subject_performance: List[SubjectPerformance]
    topic_performance: List[TopicPerformance]
    attendance: AttendanceSummary
    assignments: AssignmentSummary
    marks_trend: List[MarksTrend]
    recent_feedbacks: List[TeacherFeedbackResponse]
    weak_topics: List[TopicPerformance]
    recommendations: List[dict]


class StudentDashboardSummary(BaseModel):
    student: StudentResponse
    subject_performance: List[SubjectPerformance]
    topic_performance: List[TopicPerformance]
    recent_quiz_attempts: List[QuizAttemptResponse]
    study_sessions: List[StudySessionResponse]
    practice_effectiveness: List[dict]
    recommendations: List[dict]
    learning_timeline: List[dict]


class Recommendation(BaseModel):
    topic_id: int
    topic_name: str
    subject_name: str
    reason: str
    supporting_data: dict
    suggested_action: str
    confidence: str


class PracticeEffectiveness(BaseModel):
    topic_id: int
    topic_name: str
    subject_name: str
    pre_practice_avg: Optional[float] = None
    post_practice_avg: Optional[float] = None
    improvement: Optional[float] = None
    practice_sessions: int
    assessments_after_practice: int
    note: str


class CSVImportResult(BaseModel):
    success: bool
    imported_count: int
    rejected_count: int
    errors: List[dict]
    rejected_rows: List[dict]


class HealthCheck(BaseModel):
    status: str
    version: str
    database: str