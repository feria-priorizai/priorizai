from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class InterconsultaJSON(Base):
    __tablename__ = "interconsultas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ESPEC_ORIGEN = Column(String(120), nullable=False)
    EDAD = Column(Integer, nullable=False)
    SEXO = Column(String(20), nullable=False)
    ESPEC_DESTINO = Column(String(120), nullable=False)
    PRIORIDAD = Column(String(50), nullable=False)
    HISTORIA_CLINICA = Column(Text, nullable=False)
    FUNDAMENTOS_DIAGNOSTICO = Column(Text, nullable=False)
    EXAMENES_COMPLEMENTARIOS = Column(Text, nullable=True)
    MOTIVO_INTERCONSULTA = Column(Text, nullable=False)
