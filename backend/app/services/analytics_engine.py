import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, date
from collections import defaultdict
from enum import Enum
from app.services.data_validator import DataValidator, ValidationErrorType, ValidationResult


class TrendDirection(str, Enum):
    IMPROVING = "improving"
    STABLE = "stable"
    DECLINING = "declining"
    INSUFFICIENT_DATA = "insufficient_data"


class PerformanceStatus(str, Enum):
    GOOD = "good"
    FAIR = "fair"
    NEEDS_IMPROVEMENT = "needs_improvement"
    CRITICAL = "critical"


class DataAnalyzer:
    """Core data analysis engine using Pandas and NumPy."""

    def __init__(self, validator: DataValidator = None):
        self.validator = validator or DataValidator()

    def calculate_average_by_subject(self, results: pd.DataFrame) -> Dict[str, float]:
        """Calculate average score percentage by subject."""
        if results.empty:
            return {}

        if "percentage" not in results.columns:
            if "marks_obtained" in results.columns and "max_marks" in results.columns:
                results = results.copy()
                results["percentage"] = (
                    results["marks_obtained"] / results["max_marks"] * 100
                ).round(2)

        avg = results.groupby("subject_id")["percentage"].mean().to_dict()
        return {k: round(v, 2) for k, v in avg.items()}

    def calculate_trend_direction(
        self, scores: List[float], threshold: float = 5.0
    ) -> TrendDirection:
        """Determine trend direction from a sequence of scores.

        Rules:
        - Improving: Consistent upward movement with changes > threshold
        - Declining: Consistent downward movement with changes > threshold
        - Stable: Changes within threshold
        - Insufficient data: Fewer than 3 observations
        """
        if len(scores) < 3:
            return TrendDirection.INSUFFICIENT_DATA

        changes = np.diff(scores)

        positive_changes = np.sum(changes > threshold)
        negative_changes = np.sum(changes < -threshold)
        small_changes = np.sum(np.abs(changes) <= threshold)

        total_changes = len(changes)

        if total_changes == 0:
            return TrendDirection.STABLE

        # Check for consistent improvement
        if positive_changes / total_changes > 0.67:
            return TrendDirection.IMPROVING

        # Check for consistent decline
        if negative_changes / total_changes > 0.67:
            return TrendDirection.DECLINING

        # Check if relatively stable
        if small_changes / total_changes > 0.67:
            return TrendDirection.STABLE

        # Mixed or inconsistent - stable with variation
        return TrendDirection.STABLE

    def classify_performance_status(
        self, average_percentage: float
    ) -> PerformanceStatus:
        """Classify performance status based on average percentage."""
        if average_percentage >= 80:
            return PerformanceStatus.GOOD
        elif average_percentage >= 60:
            return PerformanceStatus.FAIR
        elif average_percentage >= 40:
            return PerformanceStatus.NEEDS_IMPROVEMENT
        else:
            return PerformanceStatus.CRITICAL

    def normalize_scores(
        self, results: pd.DataFrame, max_marks_column: str = "max_marks"
    ) -> pd.DataFrame:
        """Normalize scores when max marks differ between assessments."""
        if results.empty:
            return results

        results = results.copy()

        if max_marks_column in results.columns:
            # Normalize obtained marks to a common scale (100)
            if "marks_obtained" in results.columns:
                results["normalized_percentage"] = np.where(
                    results[max_marks_column] > 0,
                    (results["marks_obtained"] / results[max_marks_column]) * 100,
                    0,
                ).round(2)
        else:
            # If no max_marks column, assume scores are already percentages
            if "percentage" in results.columns:
                results["normalized_percentage"] = results["percentage"]
            else:
                results["normalized_percentage"] = 0

        return results

    def calculate_topic_performance(
        self,
        quiz_attempts: pd.DataFrame,
        results: pd.DataFrame = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Calculate topic-level performance from quiz attempts and assessment results."""
        topic_stats = {}

        if not quiz_attempts.empty:
            # Aggregate by topic
            topic_data = quiz_attempts.groupby("topic_id")

            for topic_id, group in topic_data:
                scores = group["score"].tolist()
                max_scores = group["max_score"].tolist()

                if scores:
                    avg_score = np.mean(scores).round(2)
                    latest_score = scores[-1] if scores else None
                    attempt_count = len(scores)

                    # Calculate trend
                    if attempt_count >= 3:
                        trend = self.calculate_trend_direction(scores)
                    else:
                        trend = TrendDirection.INSUFFICIENT_DATA

                    # Performance status
                    if latest_score is not None:
                        status = self.classify_performance_status(latest_score)
                    else:
                        status = PerformanceStatus.FAIR

                    # Percentage based on max score
                    avg_percentage = np.mean(
                        [s / m * 100 if m > 0 else 0 for s, m in zip(scores, max_scores)]
                    ).round(2)

                    topic_stats[str(topic_id)] = {
                        "latest_score": latest_score,
                        "average_score": avg_score,
                        "average_percentage": avg_percentage,
                        "attempts_count": attempt_count,
                        "trend": trend.value,
                        "status": status.value,
                        "recommended": avg_percentage < 60,
                    }

        # Also include from assessment results if available
        if results is not None and not results.empty and results.empty is False:
            # Check if there's topic-level data in results
            for _, row in results.iterrows():
                topic_id = str(row.get("topic_id"))
                if topic_id and topic_id in topic_stats:
                    # Update with result data
                    if pd.notna(row.get("percentage")):
                        topic_stats[topic_id]["average_percentage"] = round(
                            (
                                topic_stats[topic_id]["average_percentage"]
                                + row["percentage"]
                            )
                            / 2,
                            2,
                        )
                    if pd.notna(row.get("marks_obtained")) and pd.notna(row.get("max_marks")):
                        pct = row["marks_obtained"] / row["max_marks"] * 100
                        topic_stats[topic_id]["average_percentage"] = round(
                            (topic_stats[topic_id]["average_percentage"] + pct) / 2, 2
                        )
                    topic_stats[topic_id]["attempts_count"] = (
                        topic_stats[topic_id]["attempts_count"]
                        + 1
                    )

        return topic_stats

    def calculate_trend_from_assessments(
        self,
        assessment_results: pd.DataFrame,
        subject_name: str = "",
    ) -> Dict[str, Any]:
        """Calculate performance trend from assessment results over time."""
        if assessment_results.empty:
            return {
                "direction": TrendDirection.INSUFFICIENT_DATA.value,
                "description": "Insufficient assessment data to determine trend.",
                "confidence": "low",
            }

        # Sort by assessment date
        results = assessment_results.copy()
        results = results.sort_values("assessment_date")

        # Get percentages
        percentages = results["percentage"].tolist()
        dates = results["assessment_date"].tolist()

        if len(percentages) < 2:
            return {
                "direction": TrendDirection.INSUFFICIENT_DATA.value,
                "description": "Not enough assessments to determine trend.",
                "confidence": "low",
            }

        # Calculate overall direction
        first_pct = percentages[0]
        last_pct = percentages[-1]
        change = last_pct - first_pct

        total_change_pct = abs(change)
        direction = (
            TrendDirection.IMPROVING
            if change > 5
            else TrendDirection.DECLINING
            if change < -5
            else TrendDirection.STABLE
        )

        # Calculate moving averages for more nuanced analysis
        if len(percentages) >= 3:
            # 3-point moving averages
            moving_avgs = []
            for i in range(2, len(percentages)):
                ma = np.mean(percentages[i - 2 : i + 1]).round(2)
                moving_avgs.append(
                    {
                        "assessment_date": str(dates[i]),
                        "percentage": ma,
                    }
                )
        else:
            moving_avgs = []

        return {
            "direction": direction.value,
            "description": self._trend_description(direction, change),
            "change_percent": round(total_change_pct, 2),
            "first_score": round(first_pct, 2),
            "latest_score": round(last_pct, 2),
            "number_of_assessments": len(percentages),
            "change": round(change, 2),
            "moving_averages": moving_avgs,
            "confidence": "high" if len(percentages) >= 3 else "medium",
        }

    def _trend_description(
        self, direction: TrendDirection, change: float
    ) -> str:
        """Generate human-readable trend description."""
        if direction == TrendDirection.IMPROVING:
            return f"Scores improved by {abs(change):.1f} percentage points."
        elif direction == TrendDirection.DECLINING:
            return f"Scores declined by {abs(change):.1f} percentage points."
        elif direction == TrendDirection.STABLE:
            return f"Scores remained relatively stable (changed by {abs(change):.1f} percentage points)."
        else:
            return "Insufficient data to determine trend."

    def calculate_practice_effectiveness(
        self,
        quiz_attempts: pd.DataFrame,
        study_sessions: pd.DataFrame = None,
    ) -> Dict[str, Any]:
        """Compare quiz results before and after practice/study sessions.

        Analyzes whether performance improves after targeted practice periods.
        """
        if quiz_attempts.empty:
            return {
                "overall_improvement": 0,
                "improved_topics": 0,
                "declined_topics": 0,
                "unchanged_topics": 0,
                "topic_results": {},
            }

        # Sort attempts by date to establish timeline
        attempts_sorted = quiz_attempts.sort_values("attempt_date")

        # Group by topic
        topic_results = {}
        for topic_id, group in attempts_sorted.groupby("topic_id"):
            topic_scores = group["score"].tolist()
            topic_dates = group["attempt_date"].tolist()

            if len(topic_scores) < 2:
                continue

            # Split into "before" and "after" based on median date
            median_idx = len(topic_scores) // 2
            before_scores = topic_scores[:median_idx]
            after_scores = topic_scores[median_idx:]

            before_avg = np.mean(before_scores).round(2) if before_scores else 0
            after_avg = np.mean(after_scores).round(2) if after_scores else 0

            improvement = after_avg - before_avg if after_avg and before_avg else 0

            # Determine if improvement is meaningful (>5 percentage points)
            meaningful_improvement = abs(improvement) >= 5

            topic_results[str(topic_id)] = {
                "before_average": before_avg,
                "after_average": after_avg,
                "improvement": round(improvement, 2),
                "before_count": len(before_scores),
                "after_count": len(after_scores),
                "meaningful_improvement": meaningful_improvement,
                "direction": (
                    "improved" if improvement > 0 else "declined" if improvement < 0 else "unchanged"
                ),
            }

        # Overall statistics
        all_improvements = []
        improved_count = 0
        declined_count = 0
        unchanged_count = 0

        for topic_id, data in topic_results.items():
            imp = data["improvement"]
            all_improvements.append(imp)
            if data["direction"] == "improved":
                improved_count += 1
            elif data["direction"] == "declined":
                declined_count += 1
            else:
                unchanged_count += 1

        overall_improvement = np.mean(all_improvements) if all_improvements else 0

        return {
            "overall_improvement": round(overall_improvement, 2),
            "improved_topics": improved_count,
            "declined_topics": declined_count,
            "unchanged_topics": unchanged_count,
            "total_analyzed": len(topic_results),
            "topic_results": topic_results,
            "note": (
                "An observed score increase is evidence of improvement in recorded assessments, "
                "not proof that a particular study method caused the improvement."
            )
            if overall_improvement > 0
            else (
                "Score changes observed, but correlation with practice should not be assumed as causation."
            ),
        }

    def generate_recommendations(
        self,
        topic_stats: Dict[str, Dict[str, Any]],
        quiz_attempts: pd.DataFrame = None,
        student_id: int = None,
    ) -> List[Dict[str, Any]]:
        """Generate personalized recommendations based on topic performance data."""
        recommendations = []

        if not topic_stats:
            return recommendations

        # Sort topics by performance (worst first)
        sorted_topics = sorted(
            topic_stats.items(),
            key=lambda x: x[1].get("average_percentage", 100),
        )

        for topic_id, stats in sorted_topics[:5]:  # Top 5 recommendations
            avg_pct = stats.get("average_percentage", 0)
            trend = stats.get("trend", "insufficient_data")
            attempts = stats.get("attempts_count", 0)
            latest_score = stats.get("latest_score", 0)
            status = stats.get("status", "fair")

            # Build reason based on available data
            reason_parts = []
            supporting_data = {}

            if avg_pct < 50:
                reason_parts.append("low performance")
                supporting_data["average_percentage"] = avg_pct
            elif avg_pct < 65:
                reason_parts.append("below average performance")
                supporting_data["average_percentage"] = avg_pct
            elif trend == "declining":
                reason_parts.append("recent declining performance")
                if "trend_change" in stats:
                    supporting_data["trend_direction"] = stats["trend_change"]
                supporting_data["average_percentage"] = avg_pct

            if attempts < 3:
                reason_parts.append("limited practice data")
                supporting_data["attempts_count"] = attempts

            if latest_score is not None and latest_score < 50:
                reason_parts.append("recent low scores")
                supporting_data["latest_score"] = latest_score

            # Determine reason text
            if not reason_parts:
                reason_parts = ["needs attention"]

            reason = ". ".join(reason_parts) + "."

            # Suggested action
            if avg_pct < 50:
                suggested_action = "Focus on fundamental concepts and seek additional practice"
            elif avg_pct < 65:
                suggested_action = "Review core concepts and complete targeted exercises"
            elif trend == "declining":
                suggested_action = "Revisit previously covered material and assess learning approach"
            else:
                suggested_action = "Maintain current practice and explore advanced topics"

            # Confidence indicator
            if attempts >= 5 and avg_pct < 65:
                confidence = "high"
            elif attempts >= 3:
                confidence = "medium"
            else:
                confidence = "low"

            recommendation = {
                "topic_id": int(topic_id),
                "topic_name": stats.get("topic_name", f"Topic {topic_id}"),
                "subject_name": stats.get("subject_name", "Unknown"),
                "reason": reason,
                "supporting_data": supporting_data,
                "suggested_action": suggested_action,
                "confidence": confidence,
            }

            recommendations.append(recommendation)

        # Add recency-based recommendations if quiz attempts provided
        if quiz_attempts is not None and not quiz_attempts.empty:
            recent_recommendations = self._recency_based_recommendations(
                quiz_attempts, student_id
            )
            recommendations.extend(recent_recommendations)

        return recommendations

    def _recency_based_recommendations(
        self, quiz_attempts: pd.DataFrame, student_id: int = None
    ) -> List[Dict[str, Any]]:
        """Generate recommendations based on recent performance trends."""
        recommendations = []

        # Get most recent attempts per topic
        if "attempt_date" in quiz_attempts.columns:
            recent = quiz_attempts.sort_values("attempt_date", ascending=False)

            # Get latest score per topic
            latest_per_topic = recent.groupby("topic_id").first()

            for topic_id, row in latest_per_topic.iterrows():
                score = row.get("score", 0)
                topic_name = row.get("topic_name", f"Topic {topic_id}")
                subject_name = row.get("subject_name", "Unknown")

                # If score is below 65, recommend practice
                if score < 65 and pd.notna(score):
                    # Get previous attempts for this topic
                    topic_history = quiz_attempts[quiz_attempts["topic_id"] == topic_id]
                    if len(topic_history) >= 2:
                        scores = topic_history["score"].tolist()
                        if scores[-1] < np.mean(scores[:-1]):
                            # Last score is worse than average of previous
                            recommendations.append(
                                {
                                    "topic_id": int(topic_id),
                                    "topic_name": topic_name,
                                    "subject_name": subject_name,
                                    "reason": "Recent scores lower than previous performance",
                                    "supporting_data": {
                                        "latest_score": score,
                                        "previous_average": round(np.mean(scores[:-1]), 2),
                                    },
                                    "suggested_action": "Review and practice recent topics",
                                    "confidence": "medium",
                                }
                            )

        return recommendations

    def calculate_attendance_percentage(
        self, attendance_records: pd.DataFrame
    ) -> AttendanceSummary:
        """Calculate attendance percentage and trend from attendance records."""
        if attendance_records.empty:
            return AttendanceSummary(
                total_days=0,
                present_days=0,
                absent_days=0,
                late_days=0,
                attendance_percentage=0,
                trend="insufficient_data",
            )

        total = len(attendance_records)
        present = len(attendance_records[attendance_records["status"] == "present"])
        absent = len(attendance_records[attendance_records["status"] == "absent"])
        late = len(attendance_records[attendance_records["status"] == "late"])

        attendance_pct = (present / total * 100) if total > 0 else 0

        # Determine trend
        if total >= 30:
            # Split records into first half and second half
            sorted_records = attendance_records.sort_values(
                by=attendance_records.columns[0] if len(attendance_records.columns) > 0 else "id"
            )
            midpoint = len(sorted_records) // 2
            first_half = sorted_records.iloc[:midpoint]
            second_half = sorted_records.iloc[midpoint:]

            first_present = len(first_half[first_half["status"] == "present"])
            second_present = len(second_half[second_half["status"] == "present"])
            first_total = len(first_half)
            second_total = len(second_half)

            if first_total > 0 and second_total > 0:
                first_pct = first_present / first_total * 100
                second_pct = second_present / second_total * 100

                if second_pct > first_pct + 5:
                    trend = "improving"
                elif first_pct > second_pct + 5:
                    trend = "declining"
                else:
                    trend = "stable"
            else:
                trend = "stable"
        else:
            trend = "insufficient_data"

        return AttendanceSummary(
            total_days=total,
            present_days=present,
            absent_days=absent,
            late_days=late,
            attendance_percentage=round(attendance_pct, 2),
            trend=trend,
        )

    def calculate_assignment_completion(
        self, assignment_records: pd.DataFrame
    ) -> AssignmentSummary:
        """Calculate assignment completion statistics."""
        if assignment_records.empty:
            return AssignmentSummary(
                total_assignments=0,
                completed=0,
                pending=0,
                overdue=0,
                completion_rate=0,
            )

        total = len(assignment_records)
        submitted = len(assignment_records[assignment_records["status"] == "submitted"])
        pending = len(assignment_records[assignment_records["status"] == "pending"])
        overdue = len(assignment_records[assignment_records["status"] == "overdue"])

        completion_rate = (submitted / total * 100) if total > 0 else 0

        return AssignmentSummary(
            total_assignments=total,
            completed=submitted,
            pending=pending,
            overdue=overdue,
            completion_rate=round(completion_rate, 2),
        )

    def export_to_dataframe_analysis(
        self,
        students_data: List[Dict],
        subjects_data: List[Dict],
        topics_data: List[Dict],
        assessments_data: List[Dict],
        quiz_attempts_data: List[Dict],
        attendance_data: List[Dict],
        assignment_data: List[Dict],
    ) -> Dict[str, pd.DataFrame]:
        """Convert raw data lists into analyzed Pandas DataFrames."""
        frames = {}

        if students_data:
            frames["students"] = pd.DataFrame(students_data)
        else:
            frames["students"] = pd.DataFrame()

        if subjects_data:
            frames["subjects"] = pd.DataFrame(subjects_data)
        else:
            frames["subjects"] = pd.DataFrame()

        if topics_data:
            frames["topics"] = pd.DataFrame(topics_data)
        else:
            frames["topics"] = pd.DataFrame()

        if assessments_data:
            frames["assessments"] = pd.DataFrame(assessments_data)
        else:
            frames["assessments"] = pd.DataFrame()

        if quiz_attempts_data:
            frames["quiz_attempts"] = pd.DataFrame(quiz_attempts_data)
        else:
            frames["quiz_attempts"] = pd.DataFrame()

        if attendance_data:
            frames["attendance"] = pd.DataFrame(attendance_data)
        else:
            frames["attendance"] = pd.DataFrame()

        if assignment_data:
            frames["assignments"] = pd.DataFrame(assignment_data)
        else:
            frames["assignments"] = pd.DataFrame()

        # Ensure date columns are proper datetime
        for key in ["assessments", "quiz_attempts", "attendance"]:
            if key in frames and not frames[key].empty:
                date_cols = [col for col in frames[key].columns if "date" in col.lower()]
                for dc in date_cols:
                    try:
                        frames[key][dc] = pd.to_datetime(frames[key][dc], errors="coerce")
                    except Exception:
                        pass

        return frames