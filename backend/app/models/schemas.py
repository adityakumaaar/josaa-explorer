from pydantic import BaseModel, Field, model_validator


class SearchRequest(BaseModel):
    rank: int = Field(gt=0, description="CRL rank for General, category rank for others")
    crl_rank: int | None = Field(default=None, gt=0, description="CRL rank for non-General categories (to check OPEN seats)")
    category: str = Field(description="General, EWS, OBC-NCL, SC, ST")
    gender: str = Field(description="Male or Female")
    home_state: str = Field(description="Home state name")
    pwd: bool = Field(default=False)
    institute_types: list[str] | None = Field(
        default=None, description="Filter: IIT, NIT, IIIT, GFTI"
    )
    program_query: str | None = Field(
        default=None, description="Partial match on program name"
    )
    branch_keywords: list[str] | None = Field(
        default=None, description="OR-matched keywords for branch/program filtering"
    )
    college_states: list[str] | None = Field(
        default=None, description="Filter by college/institute state"
    )
    round_no: int | None = Field(
        default=None, description="Specific round; defaults to last available"
    )
    years: list[int] | None = Field(
        default=None, description="Years to include; defaults to all available"
    )
    min_rank: int | None = Field(
        default=None, gt=0,
        description="Lower bound (inclusive) of closing-rank window. When set with max_rank, replaces the implicit 'closing_rank >= rank' filter.",
    )
    max_rank: int | None = Field(
        default=None, gt=0,
        description="Upper bound (inclusive) of closing-rank window.",
    )

    @model_validator(mode="after")
    def _validate_window(self) -> "SearchRequest":
        if (
            self.min_rank is not None
            and self.max_rank is not None
            and self.min_rank > self.max_rank
        ):
            raise ValueError("min_rank must be <= max_rank")
        return self


class YearEligibility(BaseModel):
    eligible: bool
    closing_rank: int | None
    round: int
    earliest_round: int | None = None


class SearchResult(BaseModel):
    institute: str
    institute_type: str
    state: str | None
    program: str
    quota: str
    seat_type: str
    gender: str
    confidence_score: float
    has_2025: bool = False
    latest_opening_rank: int | None
    latest_closing_rank: int | None
    year_eligibility: dict[str, YearEligibility]


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int
    rank_used: int
    category: str


class MetadataResponse(BaseModel):
    years: list[int]
    max_rounds: dict[str, int]
    institute_types: list[str]
    categories: list[str]
    states: list[str]
