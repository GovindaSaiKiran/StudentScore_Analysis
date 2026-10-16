import pandas as pd
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, date
from dataclasses import dataclass
from enum import Enum


class ValidationErrorType(str, Enum):
    MISSING_VALUE = "missing_value"
    INVALID_DATA_TYPE = "invalid_data_type"
    INVALID_SCORE = "invalid_score"
    SCORE_OUT_OF_RANGE = "score_out_of_range"
    INVALID_DATE = "invalid_date"
    DUPLICATE_RECORD = "duplicate_record"
    INVALID_SUBJECT = "invalid_subject"
    INVALID_TOPIC = "invalid_topic"
    INCONSISTENT_LABEL = "inconsistent_label"


@dataclass
class ValidationError:
    row_index: int
    column: str
    error_type: ValidationErrorType
    message: str
    value: Any


@dataclass
class ValidationResult:
    is_valid: bool
    cleaned_data: pd.DataFrame
    errors: List[ValidationError]
    rejected_rows: List[Dict[str, Any]]


class DataValidator:
    def __init__(self):
        self.valid_subjects = set()
        self.valid_topics = set()
        self.valid_students = set()
        self.valid_assessment_types = {"quiz", "exam", "assignment", "practice"}
        self.valid_attendance_statuses = {"present", "absent", "late", "excused"}
        self.valid_assignment_statuses = {"pending", "submitted", "overdue", "graded"}
        self.valid_activity_types = {"study", "quiz", "revision", "homework"}

    def set_reference_data(
        self,
        subjects: List[str] = None,
        topics: List[str] = None,
        students: List[str] = None,
    ):
        if subjects:
            self.valid_subjects = {s.lower().strip() for s in subjects}
        if topics:
            self.valid_topics = {t.lower().strip() for t in topics}
        if students:
            self.valid_students = {s.lower().strip() for s in students}

    def validate_assessment_csv(self, df: pd.DataFrame) -> ValidationResult:
        required_columns = [
            "student_code",
            "subject",
            "assessment_name",
            "assessment_type",
            "max_marks",
            "marks_obtained",
            "assessment_date",
        ]
        return self._validate_csv(df, required_columns, "assessment")

    def validate_quiz_csv(self, df: pd.DataFrame) -> ValidationResult:
        required_columns = [
            "student_code",
            "subject",
            "topic",
            "score",
            "max_score",
            "attempt_date",
        ]
        return self._validate_csv(df, required_columns, "quiz")

    def validate_attendance_csv(self, df: pd.DataFrame) -> ValidationResult:
        required_columns = [
            "student_code",
            "date",
            "status",
        ]
        return self._validate_csv(df, required_columns, "attendance")

    def validate_assignment_csv(self, df: pd.DataFrame) -> ValidationResult:
        required_columns = [
            "student_code",
            "title",
            "assigned_date",
            "due_date",
        ]
        return self._validate_csv(df, required_columns, "assignment")

    def validate_study_session_csv(self, df: pd.DataFrame) -> ValidationResult:
        required_columns = [
            "student_code",
            "activity_type",
            "duration_minutes",
            "session_date",
        ]
        return self._validate_csv(df, required_columns, "study_session")

    def _validate_csv(
        self, df: pd.DataFrame, required_columns: List[str], data_type: str
    ) -> ValidationResult:
        errors = []
        rejected_rows = []
        cleaned_rows = []

        missing_cols = [col for col in required_columns if col not in df.columns]
        if missing_cols:
            for idx in df.index:
                errors.append(
                    ValidationError(
                        row_index=int(idx),
                        column=",".join(missing_cols),
                        error_type=ValidationErrorType.MISSING_VALUE,
                        message=f"Missing required columns: {missing_cols}",
                        value=None,
                    )
                )
            return ValidationResult(
                is_valid=False,
                cleaned_data=pd.DataFrame(),
                errors=errors,
                rejected_rows=df.to_dict("records"),
            )

        for idx, row in df.iterrows():
            row_errors = []
            row_dict = row.to_dict()

            if data_type == "assessment":
                row_errors.extend(self._validate_assessment_row(row, idx))
            elif data_type == "quiz":
                row_errors.extend(self._validate_quiz_row(row, idx))
            elif data_type == "attendance":
                row_errors.extend(self._validate_attendance_row(row, idx))
            elif data_type == "assignment":
                row_errors.extend(self._validate_assignment_row(row, idx))
            elif data_type == "study_session":
                row_errors.extend(self._validate_study_session_row(row, idx))

            if row_errors:
                errors.extend(row_errors)
                rejected_rows.append({**row_dict, "validation_errors": [e.message for e in row_errors]})
            else:
                cleaned_rows.append(row_dict)

        cleaned_df = pd.DataFrame(cleaned_rows) if cleaned_rows else pd.DataFrame(columns=df.columns)

        return ValidationResult(
            is_valid=len(errors) == 0,
            cleaned_data=cleaned_df,
            errors=errors,
            rejected_rows=rejected_rows,
        )

    def _validate_assessment_row(self, row: pd.Series, idx: int) -> List[ValidationError]:
        errors = []

        student_code = row.get("student_code")
        if pd.isna(student_code) or not str(student_code).strip():
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.MISSING_VALUE, "Student code is required", student_code))
        elif self.valid_students and str(student_code).strip().lower() not in self.valid_students:
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.INVALID_SUBJECT, f"Unknown student: {student_code}", student_code))

        subject = row.get("subject")
        if pd.isna(subject) or not str(subject).strip():
            errors.append(ValidationError(idx, "subject", ValidationErrorType.MISSING_VALUE, "Subject is required", subject))
        elif self.valid_subjects and str(subject).strip().lower() not in self.valid_subjects:
            errors.append(ValidationError(idx, "subject", ValidationErrorType.INVALID_SUBJECT, f"Unknown subject: {subject}", subject))

        assessment_name = row.get("assessment_name")
        if pd.isna(assessment_name) or not str(assessment_name).strip():
            errors.append(ValidationError(idx, "assessment_name", ValidationErrorType.MISSING_VALUE, "Assessment name is required", assessment_name))

        assessment_type = row.get("assessment_type")
        if pd.isna(assessment_type) or not str(assessment_type).strip():
            errors.append(ValidationError(idx, "assessment_type", ValidationErrorType.MISSING_VALUE, "Assessment type is required", assessment_type))
        elif str(assessment_type).strip().lower() not in self.valid_assessment_types:
            errors.append(ValidationError(idx, "assessment_type", ValidationErrorType.INVALID_DATA_TYPE, f"Invalid assessment type: {assessment_type}", assessment_type))

        max_marks = row.get("max_marks")
        if pd.isna(max_marks):
            errors.append(ValidationError(idx, "max_marks", ValidationErrorType.MISSING_VALUE, "Max marks is required", max_marks))
        else:
            try:
                max_marks_val = float(max_marks)
                if max_marks_val <= 0:
                    errors.append(ValidationError(idx, "max_marks", ValidationErrorType.INVALID_SCORE, "Max marks must be positive", max_marks))
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "max_marks", ValidationErrorType.INVALID_DATA_TYPE, "Max marks must be a number", max_marks))

        marks_obtained = row.get("marks_obtained")
        if pd.isna(marks_obtained):
            errors.append(ValidationError(idx, "marks_obtained", ValidationErrorType.MISSING_VALUE, "Marks obtained is required", marks_obtained))
        else:
            try:
                marks_val = float(marks_obtained)
                if marks_val < 0:
                    errors.append(ValidationError(idx, "marks_obtained", ValidationErrorType.INVALID_SCORE, "Marks obtained cannot be negative", marks_obtained))
                elif not pd.isna(max_marks):
                    try:
                        max_val = float(max_marks)
                        if marks_val > max_val:
                            errors.append(ValidationError(idx, "marks_obtained", ValidationErrorType.SCORE_OUT_OF_RANGE, f"Marks obtained ({marks_val}) exceeds max marks ({max_val})", marks_obtained))
                    except (ValueError, TypeError):
                        pass
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "marks_obtained", ValidationErrorType.INVALID_DATA_TYPE, "Marks obtained must be a number", marks_obtained))

        assessment_date = row.get("assessment_date")
        if pd.isna(assessment_date) or not str(assessment_date).strip():
            errors.append(ValidationError(idx, "assessment_date", ValidationErrorType.MISSING_VALUE, "Assessment date is required", assessment_date))
        else:
            try:
                pd.to_datetime(assessment_date)
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "assessment_date", ValidationErrorType.INVALID_DATE, f"Invalid date format: {assessment_date}", assessment_date))

        return errors

    def _validate_quiz_row(self, row: pd.Series, idx: int) -> List[ValidationError]:
        errors = []

        student_code = row.get("student_code")
        if pd.isna(student_code) or not str(student_code).strip():
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.MISSING_VALUE, "Student code is required", student_code))
        elif self.valid_students and str(student_code).strip().lower() not in self.valid_students:
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.INVALID_SUBJECT, f"Unknown student: {student_code}", student_code))

        subject = row.get("subject")
        if pd.isna(subject) or not str(subject).strip():
            errors.append(ValidationError(idx, "subject", ValidationErrorType.MISSING_VALUE, "Subject is required", subject))
        elif self.valid_subjects and str(subject).strip().lower() not in self.valid_subjects:
            errors.append(ValidationError(idx, "subject", ValidationErrorType.INVALID_SUBJECT, f"Unknown subject: {subject}", subject))

        topic = row.get("topic")
        if pd.isna(topic) or not str(topic).strip():
            errors.append(ValidationError(idx, "topic", ValidationErrorType.MISSING_VALUE, "Topic is required", topic))
        elif self.valid_topics and str(topic).strip().lower() not in self.valid_topics:
            errors.append(ValidationError(idx, "topic", ValidationErrorType.INVALID_TOPIC, f"Unknown topic: {topic}", topic))

        score = row.get("score")
        if pd.isna(score):
            errors.append(ValidationError(idx, "score", ValidationErrorType.MISSING_VALUE, "Score is required", score))
        else:
            try:
                score_val = float(score)
                if score_val < 0:
                    errors.append(ValidationError(idx, "score", ValidationErrorType.INVALID_SCORE, "Score cannot be negative", score))
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "score", ValidationErrorType.INVALID_DATA_TYPE, "Score must be a number", score))

        max_score = row.get("max_score")
        if pd.isna(max_score):
            errors.append(ValidationError(idx, "max_score", ValidationErrorType.MISSING_VALUE, "Max score is required", max_score))
        else:
            try:
                max_val = float(max_score)
                if max_val <= 0:
                    errors.append(ValidationError(idx, "max_score", ValidationErrorType.INVALID_SCORE, "Max score must be positive", max_score))
                elif not pd.isna(score):
                    try:
                        score_val = float(score)
                        if score_val > max_val:
                            errors.append(ValidationError(idx, "score", ValidationErrorType.SCORE_OUT_OF_RANGE, f"Score ({score_val}) exceeds max score ({max_val})", score))
                    except (ValueError, TypeError):
                        pass
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "max_score", ValidationErrorType.INVALID_DATA_TYPE, "Max score must be a number", max_score))

        attempt_date = row.get("attempt_date")
        if pd.isna(attempt_date) or not str(attempt_date).strip():
            errors.append(ValidationError(idx, "attempt_date", ValidationErrorType.MISSING_VALUE, "Attempt date is required", attempt_date))
        else:
            try:
                pd.to_datetime(attempt_date)
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "attempt_date", ValidationErrorType.INVALID_DATE, f"Invalid date format: {attempt_date}", attempt_date))

        return errors

    def _validate_attendance_row(self, row: pd.Series, idx: int) -> List[ValidationError]:
        errors = []

        student_code = row.get("student_code")
        if pd.isna(student_code) or not str(student_code).strip():
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.MISSING_VALUE, "Student code is required", student_code))
        elif self.valid_students and str(student_code).strip().lower() not in self.valid_students:
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.INVALID_SUBJECT, f"Unknown student: {student_code}", student_code))

        date_val = row.get("date")
        if pd.isna(date_val) or not str(date_val).strip():
            errors.append(ValidationError(idx, "date", ValidationErrorType.MISSING_VALUE, "Date is required", date_val))
        else:
            try:
                pd.to_datetime(date_val)
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "date", ValidationErrorType.INVALID_DATE, f"Invalid date format: {date_val}", date_val))

        status = row.get("status")
        if pd.isna(status) or not str(status).strip():
            errors.append(ValidationError(idx, "status", ValidationErrorType.MISSING_VALUE, "Status is required", status))
        elif str(status).strip().lower() not in self.valid_attendance_statuses:
            errors.append(ValidationError(idx, "status", ValidationErrorType.INVALID_DATA_TYPE, f"Invalid status: {status}", status))

        return errors

    def _validate_assignment_row(self, row: pd.Series, idx: int) -> List[ValidationError]:
        errors = []

        student_code = row.get("student_code")
        if pd.isna(student_code) or not str(student_code).strip():
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.MISSING_VALUE, "Student code is required", student_code))
        elif self.valid_students and str(student_code).strip().lower() not in self.valid_students:
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.INVALID_SUBJECT, f"Unknown student: {student_code}", student_code))

        title = row.get("title")
        if pd.isna(title) or not str(title).strip():
            errors.append(ValidationError(idx, "title", ValidationErrorType.MISSING_VALUE, "Title is required", title))

        assigned_date = row.get("assigned_date")
        if pd.isna(assigned_date) or not str(assigned_date).strip():
            errors.append(ValidationError(idx, "assigned_date", ValidationErrorType.MISSING_VALUE, "Assigned date is required", assigned_date))
        else:
            try:
                pd.to_datetime(assigned_date)
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "assigned_date", ValidationErrorType.INVALID_DATE, f"Invalid date format: {assigned_date}", assigned_date))

        due_date = row.get("due_date")
        if pd.isna(due_date) or not str(due_date).strip():
            errors.append(ValidationError(idx, "due_date", ValidationErrorType.MISSING_VALUE, "Due date is required", due_date))
        else:
            try:
                pd.to_datetime(due_date)
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "due_date", ValidationErrorType.INVALID_DATE, f"Invalid date format: {due_date}", due_date))

        return errors

    def _validate_study_session_row(self, row: pd.Series, idx: int) -> List[ValidationError]:
        errors = []

        student_code = row.get("student_code")
        if pd.isna(student_code) or not str(student_code).strip():
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.MISSING_VALUE, "Student code is required", student_code))
        elif self.valid_students and str(student_code).strip().lower() not in self.valid_students:
            errors.append(ValidationError(idx, "student_code", ValidationErrorType.INVALID_SUBJECT, f"Unknown student: {student_code}", student_code))

        activity_type = row.get("activity_type")
        if pd.isna(activity_type) or not str(activity_type).strip():
            errors.append(ValidationError(idx, "activity_type", ValidationErrorType.MISSING_VALUE, "Activity type is required", activity_type))
        elif str(activity_type).strip().lower() not in self.valid_activity_types:
            errors.append(ValidationError(idx, "activity_type", ValidationErrorType.INVALID_DATA_TYPE, f"Invalid activity type: {activity_type}", activity_type))

        duration = row.get("duration_minutes")
        if pd.isna(duration):
            errors.append(ValidationError(idx, "duration_minutes", ValidationErrorType.MISSING_VALUE, "Duration is required", duration))
        else:
            try:
                dur_val = int(duration)
                if dur_val <= 0:
                    errors.append(ValidationError(idx, "duration_minutes", ValidationErrorType.INVALID_SCORE, "Duration must be positive", duration))
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "duration_minutes", ValidationErrorType.INVALID_DATA_TYPE, "Duration must be an integer", duration))

        session_date = row.get("session_date")
        if pd.isna(session_date) or not str(session_date).strip():
            errors.append(ValidationError(idx, "session_date", ValidationErrorType.MISSING_VALUE, "Session date is required", session_date))
        else:
            try:
                pd.to_datetime(session_date)
            except (ValueError, TypeError):
                errors.append(ValidationError(idx, "session_date", ValidationErrorType.INVALID_DATE, f"Invalid date format: {session_date}", session_date))

        return errors