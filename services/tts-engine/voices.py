"""Available voices — Piper TTS (pt-BR)."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import List


@dataclass(frozen=True)
class Voice:
    id: str
    name: str
    language: str
    gender: str
    description: str


AVAILABLE_VOICES: List[Voice] = [
    Voice("pt_BR-edresson-low",    "Edresson", "pt-BR", "male",   "Voz masculina brasileira — leve e rápida"),
    Voice("pt_BR-faber-medium",    "Faber",    "pt-BR", "male",   "Voz masculina brasileira — qualidade média"),
    Voice("pt_BR-coqui-medium",    "Coqui",    "pt-BR", "female", "Voz feminina brasileira — qualidade média"),
]

VOICE_IDS: List[str]  = [v.id for v in AVAILABLE_VOICES]
DEFAULT_VOICE: str    = "pt_BR-edresson-low"


def is_valid(voice_id: str) -> bool:
    return voice_id in VOICE_IDS


def to_dict_list() -> List[dict]:
    return [asdict(v) for v in AVAILABLE_VOICES]


if __name__ == "__main__":
    import json
    print(json.dumps(to_dict_list(), indent=2))
