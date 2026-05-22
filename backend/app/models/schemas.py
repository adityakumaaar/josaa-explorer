from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    rank: int = Field(gt=0, description="CRL or category rank")
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
    round_no: int | None = Field(
        default=None, description="Specific round; defaults to last available"
    )
    years: list[int] | None = Field(
        default=None, description="Years to include; defaults to all available"
    )


class YearEligibility(BaseModel):
    eligible: bool
    closing_rank: int | None
    round: int


class SearchResult(BaseModel):
    institute: str
    institute_type: str
    program: str
    quota: str
    seat_type: str
    gender: str
    confidence_score: float
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
