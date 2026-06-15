from datetime import datetime, time, timedelta
import os

HORARIOS_ALVO = [x.strip() for x in os.getenv('EASYMOB_HORARIOS', '08:00,12:00,13:00,17:00').split(',') if x.strip()]
JANELA_RETRY_MINUTOS = int(os.getenv('EASYMOB_JANELA_RETRY_MINUTOS', '20') or '20')
LIMITE_INFERIOR = time(7, 0)
LIMITE_SUPERIOR = time(19, 0)
BUSINESS_DAYS_ONLY = str(os.getenv('EASYMOB_BUSINESS_DAYS_ONLY', 'true')).lower() not in ('0', 'false', 'no', 'nao', 'não')

def get_horario_alvo_atual():
    """Retorna o horário alvo da regra dentro da janela de retry, ou (None, None).

    Este módulo deve ser chamado de forma recorrente pelo watchdog. Ele não agenda
    um horário único: ele confere se o horário atual está dentro de alguma janela
    permitida e deixa o `main.py` consultar o estado real do EasyMOB antes de agir.
    """
    if BUSINESS_DAYS_ONLY and datetime.now().weekday() >= 5:
        return None, None
    now = datetime.now().time()
    if now < LIMITE_INFERIOR or now > LIMITE_SUPERIOR:
        return None, None
    dt_now = datetime.combine(datetime.today().date(), now)
    for horario_str in HORARIOS_ALVO:
        try:
            h_alvo = datetime.strptime(horario_str, "%H:%M").time()
        except ValueError:
            continue
        dt_alvo = datetime.combine(datetime.today().date(), h_alvo)
        dt_fim_janela = dt_alvo + timedelta(minutes=JANELA_RETRY_MINUTOS)
        if dt_alvo <= dt_now <= dt_fim_janela:
            return horario_str, dt_fim_janela
    return None, None

def is_horario_almoco(horario_str):
    return horario_str in ["12:00", "13:00"]
