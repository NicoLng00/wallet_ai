// Seed di partenza per il Learning Loop: backtest walk-forward REALE eseguito su storico reale
// (Alpha Vantage/CoinGecko) durante lo sviluppo, non dati inventati. Serve solo a non far partire
// Research/Storico & Memoria completamente vuoti alla prima apertura dell'app — nessuna soglia
// statistica e' stata abbassata per generarlo, e' lo stesso identico motore (engine/strategies.js,
// engine/rules.js, engine/memory.js) che l'utente userebbe eseguendo un backtest dal vivo.
//
// Usato SOLO come valore di default in models/state.js quando localStorage e' vuoto (prima
// apertura): alla prima azione reale dell'utente (un backtest, un trade chiuso, una lezione
// disattivata) i suoi dati vengono persistiti in localStorage e da quel momento hanno sempre
// precedenza — questo seed non sovrascrive mai nulla di reale dell'utente.
//
// Generato il 2026-08-18T19:34:37.177Z.
window.Aurora = window.Aurora || {};
Aurora.SeedData = {
  "generatedAt": "2026-08-18T19:34:37.177Z",
  "sourceNote": "Backtest walk-forward reale su storico scaricato da Alpha Vantage/CoinGecko (BTCUSD, ETHUSD, SPY, QQQ, AAPL, NVDA, TSLA, WTI) durante lo sviluppo — nessun dato inventato, nessuna soglia statistica abbassata per generarlo.",
  "validated": {
    "BTCUSD": {
      "candidates": {
        "sma_rsi@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1D",
          "count": 29,
          "winRate": 41.66666666666667,
          "avgReturn": -0.16334175570762785,
          "inSample": {
            "count": 17,
            "winRate": 52.94117647058824,
            "avgReturn": 0.40040245990694734,
            "totalReturn": 6.806841818418104,
            "maxDrawdown": 15.278304056032265
          },
          "outOfSample": {
            "count": 12,
            "winRate": 41.66666666666667,
            "avgReturn": -0.16334175570762785,
            "totalReturn": -1.960101068491534,
            "maxDrawdown": 8.153384788436163
          },
          "inSampleBaseline": {
            "winRate": 39.23875907660737,
            "avgReturn": -0.4458344281365306,
            "count": 15.4
          },
          "outOfSampleBaseline": {
            "winRate": 34.4465071965072,
            "avgReturn": -0.610705167225419,
            "count": 7.933333333333334
          },
          "checkedAt": "2026-08-18T16:10:02.263Z"
        },
        "macd_cross@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1D",
          "count": 44,
          "winRate": 50,
          "avgReturn": 0.03118033751338096,
          "inSample": {
            "count": 34,
            "winRate": 32.35294117647059,
            "avgReturn": -0.6985505500513007,
            "totalReturn": -23.750718701744226,
            "maxDrawdown": 29.820523017487996
          },
          "outOfSample": {
            "count": 10,
            "winRate": 50,
            "avgReturn": 0.03118033751338096,
            "totalReturn": 0.3118033751338096,
            "maxDrawdown": 7.0807241613300524
          },
          "inSampleBaseline": {
            "winRate": 40.20857350803264,
            "avgReturn": -0.4885291382304422,
            "count": 25.433333333333334
          },
          "outOfSampleBaseline": {
            "winRate": 39.03518594695064,
            "avgReturn": -0.39934989669103177,
            "count": 11.3
          },
          "checkedAt": "2026-08-18T16:10:02.263Z"
        },
        "bollinger_reversion@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "bollinger_reversion",
          "label": "Bollinger mean-reversion (20,2σ)",
          "timeframe": "1D",
          "count": 13,
          "winRate": 60,
          "avgReturn": -1.0385280972435749,
          "inSample": {
            "count": 8,
            "winRate": 62.5,
            "avgReturn": 1.371156400810539,
            "totalReturn": 10.969251206484312,
            "maxDrawdown": 5.878760122069077
          },
          "outOfSample": {
            "count": 5,
            "winRate": 60,
            "avgReturn": -1.0385280972435749,
            "totalReturn": -5.192640486217875,
            "maxDrawdown": 11.259163798429412
          },
          "inSampleBaseline": {
            "winRate": 38.327801827801835,
            "avgReturn": -0.7429712980938541,
            "count": 6.9
          },
          "outOfSampleBaseline": {
            "winRate": 34.81746031746032,
            "avgReturn": -0.6821125700832648,
            "count": 4.066666666666666
          },
          "checkedAt": "2026-08-18T16:10:02.263Z"
        },
        "sma_rsi@1h": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1h",
          "count": 149,
          "winRate": 44,
          "avgReturn": -0.023876815699218706,
          "inSample": {
            "count": 99,
            "winRate": 42.42424242424242,
            "avgReturn": -0.006283950936493409,
            "totalReturn": -0.6221111427128475,
            "maxDrawdown": 5.777792245917513
          },
          "outOfSample": {
            "count": 50,
            "winRate": 44,
            "avgReturn": -0.023876815699218706,
            "totalReturn": -1.1938407849609354,
            "maxDrawdown": 4.863426678592901
          },
          "inSampleBaseline": {
            "winRate": 48.8067030932698,
            "avgReturn": -0.07673841456758526,
            "count": 71.53333333333333
          },
          "outOfSampleBaseline": {
            "winRate": 54.06122849115583,
            "avgReturn": -0.028118842963406835,
            "count": 30.5
          },
          "checkedAt": "2026-08-18T16:10:02.263Z"
        },
        "macd_cross@1h": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1h",
          "count": 88,
          "winRate": 26.923076923076923,
          "avgReturn": -0.14550913258214299,
          "inSample": {
            "count": 62,
            "winRate": 33.87096774193548,
            "avgReturn": -0.1709540000142866,
            "totalReturn": -10.59914800088577,
            "maxDrawdown": 23.370524179763088
          },
          "outOfSample": {
            "count": 26,
            "winRate": 26.923076923076923,
            "avgReturn": -0.14550913258214299,
            "totalReturn": -3.7832374471357175,
            "maxDrawdown": 5.996102401394417
          },
          "inSampleBaseline": {
            "winRate": 48.06534687945418,
            "avgReturn": -0.08265372544606014,
            "count": 50.166666666666664
          },
          "outOfSampleBaseline": {
            "winRate": 50.03003355051859,
            "avgReturn": -0.0805950331706742,
            "count": 20.933333333333334
          },
          "checkedAt": "2026-08-18T16:10:02.263Z"
        }
      }
    },
    "ETHUSD": {
      "candidates": {
        "sma_rsi@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1D",
          "count": 24,
          "winRate": 57.14285714285714,
          "avgReturn": 1.2527171332544527,
          "inSample": {
            "count": 17,
            "winRate": 29.411764705882355,
            "avgReturn": -0.39374413067010466,
            "totalReturn": -6.6936502213917795,
            "maxDrawdown": 17.136406169853963
          },
          "outOfSample": {
            "count": 7,
            "winRate": 57.14285714285714,
            "avgReturn": 1.2527171332544527,
            "totalReturn": 8.769019932781168,
            "maxDrawdown": 4.573856753473327
          },
          "inSampleBaseline": {
            "winRate": 39.768328191702814,
            "avgReturn": -0.5570383581505419,
            "count": 15.366666666666667
          },
          "outOfSampleBaseline": {
            "winRate": 44.73172198172199,
            "avgReturn": -0.15970755197040737,
            "count": 7.633333333333334
          },
          "checkedAt": "2026-08-18T16:10:05.988Z"
        },
        "macd_cross@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1D",
          "count": 52,
          "winRate": 46.15384615384615,
          "avgReturn": 0.7456613919369748,
          "inSample": {
            "count": 39,
            "winRate": 30.76923076923077,
            "avgReturn": -0.7965786086066817,
            "totalReturn": -31.06656573566059,
            "maxDrawdown": 31.3617799234615
          },
          "outOfSample": {
            "count": 13,
            "winRate": 46.15384615384615,
            "avgReturn": 0.7456613919369748,
            "totalReturn": 9.693598095180672,
            "maxDrawdown": 11.141308407331739
          },
          "inSampleBaseline": {
            "winRate": 37.05317563371311,
            "avgReturn": -0.6957542575461488,
            "count": 29.2
          },
          "outOfSampleBaseline": {
            "winRate": 42.43590284844155,
            "avgReturn": -0.25097597754051654,
            "count": 14.233333333333333
          },
          "checkedAt": "2026-08-18T16:10:05.988Z"
        },
        "bollinger_reversion@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "bollinger_reversion",
          "label": "Bollinger mean-reversion (20,2σ)",
          "timeframe": "1D",
          "count": 12,
          "winRate": 20,
          "avgReturn": -1.5170171486520658,
          "inSample": {
            "count": 7,
            "winRate": 42.857142857142854,
            "avgReturn": -0.7478289098899124,
            "totalReturn": -5.234802369229387,
            "maxDrawdown": 17.95376112077653
          },
          "outOfSample": {
            "count": 5,
            "winRate": 20,
            "avgReturn": -1.5170171486520658,
            "totalReturn": -7.585085743260329,
            "maxDrawdown": 15.182438816166435
          },
          "inSampleBaseline": {
            "winRate": 40.09728234728235,
            "avgReturn": -0.231087761293611,
            "count": 6.433333333333334
          },
          "outOfSampleBaseline": {
            "winRate": 36.88888888888889,
            "avgReturn": -0.6841750657382302,
            "count": 3.1333333333333333
          },
          "checkedAt": "2026-08-18T16:10:05.988Z"
        },
        "sma_rsi@1h": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1h",
          "count": 142,
          "winRate": 21.153846153846153,
          "avgReturn": -0.22881398942752837,
          "inSample": {
            "count": 90,
            "winRate": 47.77777777777778,
            "avgReturn": 0.13757004969177633,
            "totalReturn": 12.38130447225987,
            "maxDrawdown": 5.442042728308645
          },
          "outOfSample": {
            "count": 52,
            "winRate": 21.153846153846153,
            "avgReturn": -0.22881398942752837,
            "totalReturn": -11.898327450231475,
            "maxDrawdown": 12.476773759383688
          },
          "inSampleBaseline": {
            "winRate": 49.50925967256531,
            "avgReturn": -0.04636158973138131,
            "count": 68.83333333333333
          },
          "outOfSampleBaseline": {
            "winRate": 49.44420723756151,
            "avgReturn": -0.051124855010598734,
            "count": 29
          },
          "checkedAt": "2026-08-18T16:10:05.988Z"
        },
        "macd_cross@1h": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1h",
          "count": 92,
          "winRate": 25.806451612903224,
          "avgReturn": -0.13676235105221515,
          "inSample": {
            "count": 61,
            "winRate": 31.147540983606557,
            "avgReturn": -0.1951526718344738,
            "totalReturn": -11.904312981902901,
            "maxDrawdown": 24.158498864537528
          },
          "outOfSample": {
            "count": 31,
            "winRate": 25.806451612903224,
            "avgReturn": -0.13676235105221515,
            "totalReturn": -4.23963288261867,
            "maxDrawdown": 9.445491067693924
          },
          "inSampleBaseline": {
            "winRate": 49.05815950614316,
            "avgReturn": -0.03984462061091865,
            "count": 50.53333333333333
          },
          "outOfSampleBaseline": {
            "winRate": 50.504931208859496,
            "avgReturn": -0.03187906382875816,
            "count": 22.1
          },
          "checkedAt": "2026-08-18T16:10:05.988Z"
        }
      }
    },
    "SPY": {
      "candidates": {
        "sma_rsi@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1D",
          "count": 6,
          "winRate": 66.66666666666666,
          "avgReturn": 0.7512880992109726,
          "inSample": {
            "count": 3,
            "winRate": 33.33333333333333,
            "avgReturn": -0.6336055013442204,
            "totalReturn": -1.9008165040326614,
            "maxDrawdown": 2.2098583393902813
          },
          "outOfSample": {
            "count": 3,
            "winRate": 66.66666666666666,
            "avgReturn": 0.7512880992109726,
            "totalReturn": 2.253864297632918,
            "maxDrawdown": 1.3497621211311306
          },
          "inSampleBaseline": {
            "winRate": 45,
            "avgReturn": -0.16895144853288144,
            "count": 2.2333333333333334
          },
          "outOfSampleBaseline": {
            "winRate": 52.777777777777786,
            "avgReturn": 0.5623925509995942,
            "count": 2.3
          },
          "checkedAt": "2026-08-18T16:19:24.799Z"
        },
        "macd_cross@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1D",
          "count": 1,
          "winRate": 0,
          "avgReturn": -1.0635182621659047,
          "inSample": {
            "count": 1,
            "winRate": 0,
            "avgReturn": -1.0635182621659047,
            "totalReturn": -1.0635182621659047,
            "maxDrawdown": 1.0635182621659047
          },
          "outOfSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 38.333333333333336,
            "avgReturn": -0.09150707122227857,
            "count": 1.0333333333333334
          },
          "outOfSampleBaseline": {
            "winRate": 30,
            "avgReturn": 0.31205304345755397,
            "count": 0.8333333333333334
          },
          "checkedAt": "2026-08-18T16:19:24.799Z"
        },
        "bollinger_reversion@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "bollinger_reversion",
          "label": "Bollinger mean-reversion (20,2σ)",
          "timeframe": "1D",
          "count": 2,
          "winRate": 100,
          "avgReturn": 1.676582677597129,
          "inSample": {
            "count": 1,
            "winRate": 100,
            "avgReturn": 1.699681568173365,
            "totalReturn": 1.699681568173365,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 1,
            "winRate": 100,
            "avgReturn": 1.676582677597129,
            "totalReturn": 1.676582677597129,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 30.555555555555554,
            "avgReturn": 0.08578709391301258,
            "count": 0.7666666666666667
          },
          "outOfSampleBaseline": {
            "winRate": 26.111111111111107,
            "avgReturn": 0.25337916328348575,
            "count": 1.0333333333333334
          },
          "checkedAt": "2026-08-18T16:19:24.799Z"
        },
        "engulfing@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "engulfing",
          "label": "Pattern Engulfing (candela)",
          "timeframe": "1D",
          "count": 0,
          "winRate": 0,
          "avgReturn": 0,
          "inSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 10,
            "avgReturn": 0.06485851424684526,
            "count": 0.16666666666666666
          },
          "outOfSampleBaseline": {
            "winRate": 23.333333333333332,
            "avgReturn": 0.1182391952769096,
            "count": 0.4
          },
          "checkedAt": "2026-08-18T16:19:24.799Z"
        }
      }
    },
    "QQQ": {
      "candidates": {
        "sma_rsi@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1D",
          "count": 10,
          "winRate": 25,
          "avgReturn": -0.5063634602856015,
          "inSample": {
            "count": 6,
            "winRate": 33.33333333333333,
            "avgReturn": -0.007218562980522518,
            "totalReturn": -0.043311377883135105,
            "maxDrawdown": 3.585853381703216
          },
          "outOfSample": {
            "count": 4,
            "winRate": 25,
            "avgReturn": -0.5063634602856015,
            "totalReturn": -2.025453841142406,
            "maxDrawdown": 3.1374408956214843
          },
          "inSampleBaseline": {
            "winRate": 45.16666666666667,
            "avgReturn": -0.1409382311845339,
            "count": 3.533333333333333
          },
          "outOfSampleBaseline": {
            "winRate": 45.05555555555555,
            "avgReturn": 0.059525327411279576,
            "count": 3.9
          },
          "checkedAt": "2026-08-18T16:20:05.064Z"
        },
        "macd_cross@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1D",
          "count": 0,
          "winRate": 0,
          "avgReturn": 0,
          "inSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 5,
            "avgReturn": -0.2803573440241573,
            "count": 0.3
          },
          "outOfSampleBaseline": {
            "winRate": 11.666666666666666,
            "avgReturn": -0.21239018046017785,
            "count": 0.3333333333333333
          },
          "checkedAt": "2026-08-18T16:20:05.064Z"
        },
        "bollinger_reversion@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "bollinger_reversion",
          "label": "Bollinger mean-reversion (20,2σ)",
          "timeframe": "1D",
          "count": 3,
          "winRate": 33.33333333333333,
          "avgReturn": -0.7468098317891233,
          "inSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 3,
            "winRate": 33.33333333333333,
            "avgReturn": -0.7468098317891233,
            "totalReturn": -2.24042949536737,
            "maxDrawdown": 2.3454156170649676
          },
          "inSampleBaseline": {
            "winRate": 16.666666666666668,
            "avgReturn": 0.4167752160918616,
            "count": 0.26666666666666666
          },
          "outOfSampleBaseline": {
            "winRate": 11.666666666666666,
            "avgReturn": 0.19197576872699568,
            "count": 0.26666666666666666
          },
          "checkedAt": "2026-08-18T16:20:05.064Z"
        },
        "engulfing@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "engulfing",
          "label": "Pattern Engulfing (candela)",
          "timeframe": "1D",
          "count": 0,
          "winRate": 0,
          "avgReturn": 0,
          "inSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 0,
            "avgReturn": -0.24693794020258072,
            "count": 0.2
          },
          "outOfSampleBaseline": {
            "winRate": 10,
            "avgReturn": 0.2054360995742076,
            "count": 0.26666666666666666
          },
          "checkedAt": "2026-08-18T16:20:05.064Z"
        }
      }
    },
    "AAPL": {
      "candidates": {
        "sma_rsi@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1D",
          "count": 9,
          "winRate": 33.33333333333333,
          "avgReturn": -2.248092653028843,
          "inSample": {
            "count": 6,
            "winRate": 50,
            "avgReturn": 1.1380877643408371,
            "totalReturn": 6.828526586045022,
            "maxDrawdown": 2.758525384143841
          },
          "outOfSample": {
            "count": 3,
            "winRate": 33.33333333333333,
            "avgReturn": -2.248092653028843,
            "totalReturn": -6.74427795908653,
            "maxDrawdown": 10.275957372131346
          },
          "inSampleBaseline": {
            "winRate": 54.38888888888889,
            "avgReturn": 0.28403608867153757,
            "count": 3.6
          },
          "outOfSampleBaseline": {
            "winRate": 46.388888888888886,
            "avgReturn": -0.537649442502844,
            "count": 4.366666666666666
          },
          "checkedAt": "2026-08-18T16:20:29.237Z"
        },
        "macd_cross@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1D",
          "count": 5,
          "winRate": 25,
          "avgReturn": -1.7704730431213023,
          "inSample": {
            "count": 1,
            "winRate": 100,
            "avgReturn": 2.8124291222499456,
            "totalReturn": 2.8124291222499456,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 4,
            "winRate": 25,
            "avgReturn": -1.7704730431213023,
            "totalReturn": -7.081892172485209,
            "maxDrawdown": 11.096374799684595
          },
          "inSampleBaseline": {
            "winRate": 40,
            "avgReturn": -0.351544466995036,
            "count": 0.8333333333333334
          },
          "outOfSampleBaseline": {
            "winRate": 28.88888888888889,
            "avgReturn": -0.044648022117592744,
            "count": 0.8666666666666667
          },
          "checkedAt": "2026-08-18T16:20:29.237Z"
        },
        "bollinger_reversion@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "bollinger_reversion",
          "label": "Bollinger mean-reversion (20,2σ)",
          "timeframe": "1D",
          "count": 2,
          "winRate": 100,
          "avgReturn": 1.745485550926629,
          "inSample": {
            "count": 2,
            "winRate": 100,
            "avgReturn": 1.745485550926629,
            "totalReturn": 3.490971101853258,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 34.666666666666664,
            "avgReturn": -0.5704650268683316,
            "count": 1.3666666666666667
          },
          "outOfSampleBaseline": {
            "winRate": 45.833333333333336,
            "avgReturn": -0.09009614863095342,
            "count": 1.9333333333333333
          },
          "checkedAt": "2026-08-18T16:20:29.237Z"
        },
        "engulfing@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "engulfing",
          "label": "Pattern Engulfing (candela)",
          "timeframe": "1D",
          "count": 1,
          "winRate": 100,
          "avgReturn": 1.7348631462537951,
          "inSample": {
            "count": 1,
            "winRate": 100,
            "avgReturn": 1.7348631462537951,
            "totalReturn": 1.7348631462537951,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 33.333333333333336,
            "avgReturn": -0.2085881341725429,
            "count": 0.7333333333333333
          },
          "outOfSampleBaseline": {
            "winRate": 42.222222222222214,
            "avgReturn": 0.5425720180338587,
            "count": 0.8666666666666667
          },
          "checkedAt": "2026-08-18T16:20:29.237Z"
        }
      }
    },
    "NVDA": {
      "candidates": {
        "sma_rsi@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1D",
          "count": 8,
          "winRate": 40,
          "avgReturn": 0.3627405674650639,
          "inSample": {
            "count": 3,
            "winRate": 0,
            "avgReturn": -2.3575792729054807,
            "totalReturn": -7.072737818716442,
            "maxDrawdown": 7.072737818716442
          },
          "outOfSample": {
            "count": 5,
            "winRate": 40,
            "avgReturn": 0.3627405674650639,
            "totalReturn": 1.8137028373253195,
            "maxDrawdown": 7.155589580119878
          },
          "inSampleBaseline": {
            "winRate": 43.05555555555556,
            "avgReturn": 0.3050914454649048,
            "count": 2.1
          },
          "outOfSampleBaseline": {
            "winRate": 58.61111111111111,
            "avgReturn": 1.0481851792257963,
            "count": 2.8666666666666667
          },
          "checkedAt": "2026-08-18T16:20:53.471Z"
        },
        "macd_cross@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1D",
          "count": 7,
          "winRate": 71.42857142857143,
          "avgReturn": 1.4319334731301843,
          "inSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 7,
            "winRate": 71.42857142857143,
            "avgReturn": 1.4319334731301843,
            "totalReturn": 10.02353431191129,
            "maxDrawdown": 5.8679823721019355
          },
          "inSampleBaseline": {
            "winRate": 10,
            "avgReturn": 0.05346673052792588,
            "count": 0.2
          },
          "outOfSampleBaseline": {
            "winRate": 13.333333333333334,
            "avgReturn": -0.017508497366565758,
            "count": 0.3
          },
          "checkedAt": "2026-08-18T16:20:53.471Z"
        },
        "bollinger_reversion@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "bollinger_reversion",
          "label": "Bollinger mean-reversion (20,2σ)",
          "timeframe": "1D",
          "count": 3,
          "winRate": 100,
          "avgReturn": 2.6472290932056217,
          "inSample": {
            "count": 2,
            "winRate": 100,
            "avgReturn": 1.9731623074722044,
            "totalReturn": 3.946324614944409,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 1,
            "winRate": 100,
            "avgReturn": 2.6472290932056217,
            "totalReturn": 2.6472290932056217,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 50.27777777777778,
            "avgReturn": 0.5336845770929187,
            "count": 1.8666666666666667
          },
          "outOfSampleBaseline": {
            "winRate": 40.611111111111114,
            "avgReturn": -0.4397455516547137,
            "count": 2.8
          },
          "checkedAt": "2026-08-18T16:20:53.471Z"
        },
        "engulfing@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "engulfing",
          "label": "Pattern Engulfing (candela)",
          "timeframe": "1D",
          "count": 2,
          "winRate": 0,
          "avgReturn": -2.5390790204659814,
          "inSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 2,
            "winRate": 0,
            "avgReturn": -2.5390790204659814,
            "totalReturn": -5.078158040931963,
            "maxDrawdown": 5.078158040931963
          },
          "inSampleBaseline": {
            "winRate": 13.333333333333334,
            "avgReturn": 0.4937118035998772,
            "count": 0.2
          },
          "outOfSampleBaseline": {
            "winRate": 5,
            "avgReturn": -0.2759398304659706,
            "count": 0.2
          },
          "checkedAt": "2026-08-18T16:20:53.471Z"
        }
      }
    },
    "TSLA": {
      "candidates": {
        "sma_rsi@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1D",
          "count": 5,
          "winRate": 40,
          "avgReturn": -1.3063052116068676,
          "inSample": {
            "count": 5,
            "winRate": 40,
            "avgReturn": -1.3063052116068676,
            "totalReturn": -6.531526058034338,
            "maxDrawdown": 6.537547840751275
          },
          "outOfSample": {
            "count": 0,
            "winRate": 0,
            "avgReturn": 0,
            "totalReturn": 0,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 42.888888888888886,
            "avgReturn": 0.20573990814560295,
            "count": 3.466666666666667
          },
          "outOfSampleBaseline": {
            "winRate": 44.80952380952382,
            "avgReturn": -1.0143707549814696,
            "count": 5.066666666666666
          },
          "checkedAt": "2026-08-18T16:21:18.264Z"
        },
        "macd_cross@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1D",
          "count": 5,
          "winRate": 66.66666666666666,
          "avgReturn": 1.1482687018681903,
          "inSample": {
            "count": 2,
            "winRate": 0,
            "avgReturn": -5.236965834527213,
            "totalReturn": -10.473931669054426,
            "maxDrawdown": 10.473931669054426
          },
          "outOfSample": {
            "count": 3,
            "winRate": 66.66666666666666,
            "avgReturn": 1.1482687018681903,
            "totalReturn": 3.444806105604571,
            "maxDrawdown": 3.1881498920933886
          },
          "inSampleBaseline": {
            "winRate": 28.055555555555554,
            "avgReturn": -0.07350734394680583,
            "count": 1.8333333333333333
          },
          "outOfSampleBaseline": {
            "winRate": 33.333333333333336,
            "avgReturn": -1.7240578659102241,
            "count": 2.4
          },
          "checkedAt": "2026-08-18T16:21:18.264Z"
        },
        "bollinger_reversion@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "bollinger_reversion",
          "label": "Bollinger mean-reversion (20,2σ)",
          "timeframe": "1D",
          "count": 4,
          "winRate": 0,
          "avgReturn": -1.3294550519073962,
          "inSample": {
            "count": 2,
            "winRate": 100,
            "avgReturn": 4.596295289952813,
            "totalReturn": 9.192590579905627,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 2,
            "winRate": 0,
            "avgReturn": -1.3294550519073962,
            "totalReturn": -2.6589101038147924,
            "maxDrawdown": 2.6589101038147924
          },
          "inSampleBaseline": {
            "winRate": 44.72222222222222,
            "avgReturn": 0.07310493585380122,
            "count": 1.8
          },
          "outOfSampleBaseline": {
            "winRate": 23.83333333333333,
            "avgReturn": -1.8533595791079303,
            "count": 2.066666666666667
          },
          "checkedAt": "2026-08-18T16:21:18.264Z"
        },
        "engulfing@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "engulfing",
          "label": "Pattern Engulfing (candela)",
          "timeframe": "1D",
          "count": 3,
          "winRate": 100,
          "avgReturn": 0.48855903656342314,
          "inSample": {
            "count": 1,
            "winRate": 100,
            "avgReturn": 8.46172078691633,
            "totalReturn": 8.46172078691633,
            "maxDrawdown": 0
          },
          "outOfSample": {
            "count": 2,
            "winRate": 100,
            "avgReturn": 0.48855903656342314,
            "totalReturn": 0.9771180731268463,
            "maxDrawdown": 0
          },
          "inSampleBaseline": {
            "winRate": 19.444444444444443,
            "avgReturn": -0.3863388460069092,
            "count": 0.9666666666666667
          },
          "outOfSampleBaseline": {
            "winRate": 21.666666666666668,
            "avgReturn": -1.2160159061830003,
            "count": 1.4
          },
          "checkedAt": "2026-08-18T16:21:18.264Z"
        }
      }
    },
    "WTI": {
      "candidates": {
        "sma_rsi@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "sma_rsi",
          "label": "SMA50/RSI14 (trend)",
          "timeframe": "1D",
          "count": 1288,
          "winRate": 46.97802197802198,
          "avgReturn": 0.038051707688259426,
          "inSample": {
            "count": 924,
            "winRate": 46.86147186147186,
            "avgReturn": 0.1975516554713746,
            "totalReturn": 182.53772965555012,
            "maxDrawdown": 73.23686208149815
          },
          "outOfSample": {
            "count": 364,
            "winRate": 46.97802197802198,
            "avgReturn": 0.038051707688259426,
            "totalReturn": 13.85082159852643,
            "maxDrawdown": 40.91764938220711
          },
          "inSampleBaseline": {
            "winRate": 48.765857005398615,
            "avgReturn": 0.19643271627628842,
            "count": 693.1333333333333
          },
          "outOfSampleBaseline": {
            "winRate": 45.78433666879656,
            "avgReturn": -0.13232709627665698,
            "count": 310.1666666666667
          },
          "checkedAt": "2026-08-18T16:14:27.695Z"
        },
        "macd_cross@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "macd_cross",
          "label": "MACD crossover (12/26/9)",
          "timeframe": "1D",
          "count": 1439,
          "winRate": 43.90243902439025,
          "avgReturn": -0.5917511990042704,
          "inSample": {
            "count": 988,
            "winRate": 44.33198380566802,
            "avgReturn": 0.18080384853445167,
            "totalReturn": 178.63420235203824,
            "maxDrawdown": 94.84695849518631
          },
          "outOfSample": {
            "count": 451,
            "winRate": 43.90243902439025,
            "avgReturn": -0.5917511990042704,
            "totalReturn": -266.87979075092596,
            "maxDrawdown": 339.7552019311543
          },
          "inSampleBaseline": {
            "winRate": 48.49957857670336,
            "avgReturn": 0.1890232711233761,
            "count": 736.0333333333333
          },
          "outOfSampleBaseline": {
            "winRate": 46.68096922551196,
            "avgReturn": -0.13635637147687277,
            "count": 317.2
          },
          "checkedAt": "2026-08-18T16:14:27.695Z"
        },
        "bollinger_reversion@1D": {
          "validated": false,
          "exploratory": false,
          "strategyId": "bollinger_reversion",
          "label": "Bollinger mean-reversion (20,2σ)",
          "timeframe": "1D",
          "count": 358,
          "winRate": 63.24786324786324,
          "avgReturn": -0.8131809482322023,
          "inSample": {
            "count": 241,
            "winRate": 56.016597510373444,
            "avgReturn": 0.10539102203461216,
            "totalReturn": 25.399236310341532,
            "maxDrawdown": 27.47804612744938
          },
          "outOfSample": {
            "count": 117,
            "winRate": 63.24786324786324,
            "avgReturn": -0.8131809482322023,
            "totalReturn": -95.14217094316767,
            "maxDrawdown": 149.84071642039362
          },
          "inSampleBaseline": {
            "winRate": 48.44953899789449,
            "avgReturn": 0.23411749316955693,
            "count": 221.73333333333332
          },
          "outOfSampleBaseline": {
            "winRate": 47.755404101694054,
            "avgReturn": -0.06887942406670117,
            "count": 95.66666666666667
          },
          "checkedAt": "2026-08-18T16:14:27.695Z"
        }
      }
    }
  },
  "trackRecord": {},
  "tradeEpisodes": {
    "sma_rsi@1D": [
      {
        "tradeId": "SIM-1003918",
        "symbol": "SPY",
        "returnPct": -13.286580070539452,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 739.7839911260087,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-18T16:36:43.918Z"
      },
      {
        "tradeId": "SEED-BTCUSD-00004",
        "symbol": "BTCUSD",
        "returnPct": -1.087,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 64240.2854979777,
          "confidence": 33,
          "score": 45,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-03-02T19:34:36.997Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00011",
        "symbol": "ETHUSD",
        "returnPct": 0.514,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1912.6374211796215,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2025-12-20T19:34:37.006Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00012",
        "symbol": "ETHUSD",
        "returnPct": 0.035,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1922.4599367503984,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-01-13T19:34:37.007Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00013",
        "symbol": "ETHUSD",
        "returnPct": -1.723,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1923.1282360503992,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-02-06T19:34:37.009Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00014",
        "symbol": "ETHUSD",
        "returnPct": -0.916,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1889.984585950214,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-03-02T19:34:37.011Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00015",
        "symbol": "ETHUSD",
        "returnPct": 0.67,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1872.6662007765653,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-03-26T19:34:37.012Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00016",
        "symbol": "ETHUSD",
        "returnPct": 0.424,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1885.2038405062624,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-19T19:34:37.014Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00017",
        "symbol": "ETHUSD",
        "returnPct": -1.479,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1893.1956165795934,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-13T19:34:37.015Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00018",
        "symbol": "ETHUSD",
        "returnPct": 0.877,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1865.199663575676,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-06T19:34:37.016Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00019",
        "symbol": "ETHUSD",
        "returnPct": 0.011,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1881.559041511082,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-30T19:34:37.016Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00020",
        "symbol": "ETHUSD",
        "returnPct": 1.256,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1881.7600648211728,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-07-24T19:34:37.017Z"
      },
      {
        "tradeId": "SEED-ETHUSD-00021",
        "symbol": "ETHUSD",
        "returnPct": 0.268,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 1905.3938852906615,
          "confidence": 35,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-08-17T19:34:37.018Z"
      },
      {
        "tradeId": "SEED-SPY-00022",
        "symbol": "SPY",
        "returnPct": -1.72,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 741.75,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-13T19:34:37.019Z"
      },
      {
        "tradeId": "SEED-SPY-00023",
        "symbol": "SPY",
        "returnPct": 2.25,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 741,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "elevated",
          "aiEngine": "rule"
        },
        "at": "2026-08-07T19:34:37.020Z"
      },
      {
        "tradeId": "SEED-QQQ-00024",
        "symbol": "QQQ",
        "returnPct": 3.141,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 721.34,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-05T19:34:37.022Z"
      },
      {
        "tradeId": "SEED-QQQ-00025",
        "symbol": "QQQ",
        "returnPct": -1.901,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 744,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-06T19:34:37.022Z"
      },
      {
        "tradeId": "SEED-QQQ-00026",
        "symbol": "QQQ",
        "returnPct": -2.221,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 729.86,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-10T19:34:37.023Z"
      },
      {
        "tradeId": "SEED-QQQ-00027",
        "symbol": "QQQ",
        "returnPct": 3.188,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 713.65,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": "elevated",
          "aiEngine": "rule"
        },
        "at": "2026-07-15T19:34:37.024Z"
      },
      {
        "tradeId": "SEED-QQQ-00028",
        "symbol": "QQQ",
        "returnPct": -3.232,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 736.4,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": "elevated",
          "aiEngine": "rule"
        },
        "at": "2026-07-17T19:34:37.025Z"
      },
      {
        "tradeId": "SEED-QQQ-00029",
        "symbol": "QQQ",
        "returnPct": -2.424,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 712.6,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-27T19:34:37.026Z"
      },
      {
        "tradeId": "SEED-AAPL-00033",
        "symbol": "AAPL",
        "returnPct": -7.176,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 296.42,
          "confidence": 30,
          "score": 6,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-12T19:34:37.029Z"
      },
      {
        "tradeId": "SEED-AAPL-00041",
        "symbol": "AAPL",
        "returnPct": -1.618,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 313.33,
          "confidence": 30,
          "score": 6,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-12T19:34:37.036Z"
      },
      {
        "tradeId": "SEED-NVDA-00042",
        "symbol": "NVDA",
        "returnPct": -2.372,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 212.45,
          "confidence": 30,
          "score": 9,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-06T19:34:37.037Z"
      },
      {
        "tradeId": "SEED-NVDA-00043",
        "symbol": "NVDA",
        "returnPct": -5.055,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 210.69,
          "confidence": 30,
          "score": 9,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-10T19:34:37.037Z"
      },
      {
        "tradeId": "SEED-NVDA-00053",
        "symbol": "NVDA",
        "returnPct": 6.088,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 206.64,
          "confidence": 30,
          "score": 9,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-09T19:34:37.046Z"
      },
      {
        "tradeId": "SEED-TSLA-00054",
        "symbol": "TSLA",
        "returnPct": -2.473,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 406.43,
          "confidence": 30,
          "score": 25,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-07T19:34:37.047Z"
      },
      {
        "tradeId": "SEED-TSLA-00055",
        "symbol": "TSLA",
        "returnPct": -5.787,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 405.05,
          "confidence": 30,
          "score": 25,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-10T19:34:37.048Z"
      },
      {
        "tradeId": "SEED-WTI-00067",
        "symbol": "WTI",
        "returnPct": -3.422,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 68.39,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2025-11-28T19:34:37.060Z"
      },
      {
        "tradeId": "SEED-WTI-00068",
        "symbol": "WTI",
        "returnPct": 4.631,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 67.16,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2025-12-02T19:34:37.061Z"
      },
      {
        "tradeId": "SEED-WTI-00069",
        "symbol": "WTI",
        "returnPct": -2.675,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 70.27,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2025-12-05T19:34:37.062Z"
      },
      {
        "tradeId": "SEED-WTI-00070",
        "symbol": "WTI",
        "returnPct": -3.202,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 68.39,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2025-12-07T19:34:37.063Z"
      },
      {
        "tradeId": "SEED-WTI-00075",
        "symbol": "WTI",
        "returnPct": -1.893,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 65.51,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-01-14T19:34:37.069Z"
      },
      {
        "tradeId": "SEED-WTI-00087",
        "symbol": "WTI",
        "returnPct": 3.206,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 58.96,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-03-26T19:34:37.083Z"
      },
      {
        "tradeId": "SEED-WTI-00088",
        "symbol": "WTI",
        "returnPct": -2.827,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 60.85,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-03-28T19:34:37.084Z"
      },
      {
        "tradeId": "SEED-WTI-00089",
        "symbol": "WTI",
        "returnPct": 4.921,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 59.13,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-04T19:34:37.085Z"
      },
      {
        "tradeId": "SEED-WTI-00090",
        "symbol": "WTI",
        "returnPct": 4.4,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 62.04,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-06T19:34:37.086Z"
      },
      {
        "tradeId": "SEED-WTI-00092",
        "symbol": "WTI",
        "returnPct": 4.805,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 61.6,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-10T19:34:37.088Z"
      },
      {
        "tradeId": "SEED-WTI-00093",
        "symbol": "WTI",
        "returnPct": -2.571,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 64.56,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-11T19:34:37.089Z"
      },
      {
        "tradeId": "SEED-WTI-00094",
        "symbol": "WTI",
        "returnPct": 3.021,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 62.9,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-15T19:34:37.091Z"
      },
      {
        "tradeId": "SEED-WTI-00095",
        "symbol": "WTI",
        "returnPct": -2.654,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 64.8,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-16T19:34:37.093Z"
      },
      {
        "tradeId": "SEED-WTI-00096",
        "symbol": "WTI",
        "returnPct": 3.567,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 63.08,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-19T19:34:37.095Z"
      },
      {
        "tradeId": "SEED-WTI-00097",
        "symbol": "WTI",
        "returnPct": 8.878,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 65.33,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-27T19:34:37.096Z"
      },
      {
        "tradeId": "SEED-WTI-00110",
        "symbol": "WTI",
        "returnPct": 4.31,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 89.33,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-13T19:34:37.110Z"
      },
      {
        "tradeId": "SEED-WTI-00111",
        "symbol": "WTI",
        "returnPct": -1.792,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 93.18,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-14T19:34:37.111Z"
      },
      {
        "tradeId": "SEED-WTI-00112",
        "symbol": "WTI",
        "returnPct": 5.103,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 91.51,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-15T19:34:37.112Z"
      },
      {
        "tradeId": "SEED-WTI-00113",
        "symbol": "WTI",
        "returnPct": 5.282,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 96.18,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-16T19:34:37.114Z"
      },
      {
        "tradeId": "SEED-WTI-00114",
        "symbol": "WTI",
        "returnPct": 3.387,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 101.26,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-17T19:34:37.115Z"
      },
      {
        "tradeId": "SEED-WTI-00115",
        "symbol": "WTI",
        "returnPct": -1.748,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 104.69,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-18T19:34:37.117Z"
      },
      {
        "tradeId": "SEED-WTI-00116",
        "symbol": "WTI",
        "returnPct": 10.082,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 102.86,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-20T19:34:37.118Z"
      },
      {
        "tradeId": "SEED-WTI-00117",
        "symbol": "WTI",
        "returnPct": -15.067,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 113.23,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-23T19:34:37.119Z"
      },
      {
        "tradeId": "SEED-WTI-00118",
        "symbol": "WTI",
        "returnPct": 3.587,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 96.17,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-24T19:34:37.121Z"
      },
      {
        "tradeId": "SEED-WTI-00119",
        "symbol": "WTI",
        "returnPct": -6.575,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 99.62,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-27T19:34:37.122Z"
      },
      {
        "tradeId": "SEED-WTI-00120",
        "symbol": "WTI",
        "returnPct": 3.642,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 93.07,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-29T19:34:37.123Z"
      },
      {
        "tradeId": "SEED-WTI-00121",
        "symbol": "WTI",
        "returnPct": -10.937,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 96.46,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-30T19:34:37.125Z"
      },
      {
        "tradeId": "SEED-WTI-00122",
        "symbol": "WTI",
        "returnPct": 6.012,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 93.64,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-03T19:34:37.126Z"
      },
      {
        "tradeId": "SEED-WTI-00123",
        "symbol": "WTI",
        "returnPct": 6.786,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 103.45,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-07T19:34:37.128Z"
      },
      {
        "tradeId": "SEED-WTI-00124",
        "symbol": "WTI",
        "returnPct": -1.657,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 110.47,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-08T19:34:37.130Z"
      },
      {
        "tradeId": "SEED-WTI-00125",
        "symbol": "WTI",
        "returnPct": -3.001,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 108.64,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-09T19:34:37.132Z"
      },
      {
        "tradeId": "SEED-WTI-00126",
        "symbol": "WTI",
        "returnPct": 4.156,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 105.38,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-10T19:34:37.134Z"
      },
      {
        "tradeId": "SEED-WTI-00127",
        "symbol": "WTI",
        "returnPct": -3.735,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 109.76,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-11T19:34:37.136Z"
      },
      {
        "tradeId": "SEED-WTI-00128",
        "symbol": "WTI",
        "returnPct": -6.54,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 105.66,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-12T19:34:37.138Z"
      },
      {
        "tradeId": "SEED-WTI-00129",
        "symbol": "WTI",
        "returnPct": 2.846,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 98.75,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-15T19:34:37.140Z"
      },
      {
        "tradeId": "SEED-WTI-00130",
        "symbol": "WTI",
        "returnPct": 4.155,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 101.56,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-16T19:34:37.141Z"
      },
      {
        "tradeId": "SEED-WTI-00131",
        "symbol": "WTI",
        "returnPct": 3.035,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 105.78,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-19T19:34:37.143Z"
      },
      {
        "tradeId": "SEED-WTI-00132",
        "symbol": "WTI",
        "returnPct": 2.991,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 108.99,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-20T19:34:37.144Z"
      },
      {
        "tradeId": "SEED-WTI-00133",
        "symbol": "WTI",
        "returnPct": -9.408,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 112.25,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-22T19:34:37.146Z"
      },
      {
        "tradeId": "SEED-WTI-00134",
        "symbol": "WTI",
        "returnPct": -3.993,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 101.69,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-25T19:34:37.148Z"
      },
      {
        "tradeId": "SEED-WTI-00147",
        "symbol": "WTI",
        "returnPct": -4.786,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "sma_rsi@1D",
          "entryPrice": 86.08,
          "confidence": 30,
          "score": 37,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-08-11T19:34:37.174Z"
      }
    ],
    "macd_cross@1D": [
      {
        "tradeId": "SEED-BTCUSD-00001",
        "symbol": "BTCUSD",
        "returnPct": 0.207,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 64911.41398008584,
          "confidence": 34,
          "score": 52,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2025-12-20T19:34:36.988Z"
      },
      {
        "tradeId": "SEED-BTCUSD-00002",
        "symbol": "BTCUSD",
        "returnPct": 0.199,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 65045.63095834028,
          "confidence": 34,
          "score": 52,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-01-13T19:34:36.994Z"
      },
      {
        "tradeId": "SEED-BTCUSD-00003",
        "symbol": "BTCUSD",
        "returnPct": -1.434,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 65174.8913003962,
          "confidence": 34,
          "score": 52,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-02-06T19:34:36.996Z"
      },
      {
        "tradeId": "SEED-AAPL-00036",
        "symbol": "AAPL",
        "returnPct": 2.812,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 308.63,
          "confidence": 30,
          "score": 22,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-23T19:34:37.031Z"
      },
      {
        "tradeId": "SEED-AAPL-00037",
        "symbol": "AAPL",
        "returnPct": 3.211,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 317.31,
          "confidence": 30,
          "score": 22,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-25T19:34:37.032Z"
      },
      {
        "tradeId": "SEED-AAPL-00038",
        "symbol": "AAPL",
        "returnPct": -1.783,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 327.5,
          "confidence": 30,
          "score": 22,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-31T19:34:37.033Z"
      },
      {
        "tradeId": "SEED-AAPL-00039",
        "symbol": "AAPL",
        "returnPct": 3.532,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 321.66,
          "confidence": 30,
          "score": 22,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-01T19:34:37.034Z"
      },
      {
        "tradeId": "SEED-AAPL-00040",
        "symbol": "AAPL",
        "returnPct": -7.24,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 333.02,
          "confidence": 30,
          "score": 22,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-06T19:34:37.035Z"
      },
      {
        "tradeId": "SEED-NVDA-00044",
        "symbol": "NVDA",
        "returnPct": 3.351,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 204.12,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-22T19:34:37.038Z"
      },
      {
        "tradeId": "SEED-NVDA-00045",
        "symbol": "NVDA",
        "returnPct": -3.522,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 210.96,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-23T19:34:37.039Z"
      },
      {
        "tradeId": "SEED-NVDA-00046",
        "symbol": "NVDA",
        "returnPct": 4.063,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 203.53,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-24T19:34:37.040Z"
      },
      {
        "tradeId": "SEED-NVDA-00047",
        "symbol": "NVDA",
        "returnPct": -2.077,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 211.8,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-26T19:34:37.041Z"
      },
      {
        "tradeId": "SEED-NVDA-00048",
        "symbol": "NVDA",
        "returnPct": -2.213,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 207.4,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-27T19:34:37.042Z"
      },
      {
        "tradeId": "SEED-NVDA-00049",
        "symbol": "NVDA",
        "returnPct": 4.561,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 202.81,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-30T19:34:37.043Z"
      },
      {
        "tradeId": "SEED-NVDA-00050",
        "symbol": "NVDA",
        "returnPct": -2.462,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 212.06,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-01T19:34:37.044Z"
      },
      {
        "tradeId": "SEED-NVDA-00051",
        "symbol": "NVDA",
        "returnPct": -4.994,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 206.84,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-02T19:34:37.044Z"
      },
      {
        "tradeId": "SEED-TSLA-00057",
        "symbol": "TSLA",
        "returnPct": -7.489,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 425.3,
          "confidence": 43,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-17T19:34:37.050Z"
      },
      {
        "tradeId": "SEED-TSLA-00058",
        "symbol": "TSLA",
        "returnPct": 6.69,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 393.45,
          "confidence": 43,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-18T19:34:37.051Z"
      },
      {
        "tradeId": "SEED-TSLA-00059",
        "symbol": "TSLA",
        "returnPct": -4.019,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 419.77,
          "confidence": 43,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-19T19:34:37.052Z"
      },
      {
        "tradeId": "SEED-TSLA-00060",
        "symbol": "TSLA",
        "returnPct": -2.194,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 402.9,
          "confidence": 43,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-20T19:34:37.053Z"
      },
      {
        "tradeId": "SEED-TSLA-00061",
        "symbol": "TSLA",
        "returnPct": 3.17,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 394.06,
          "confidence": 43,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-21T19:34:37.054Z"
      },
      {
        "tradeId": "SEED-TSLA-00062",
        "symbol": "TSLA",
        "returnPct": -2.9,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 406.55,
          "confidence": 43,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-23T19:34:37.054Z"
      },
      {
        "tradeId": "SEED-TSLA-00063",
        "symbol": "TSLA",
        "returnPct": -3.526,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 394.76,
          "confidence": 43,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-27T19:34:37.056Z"
      },
      {
        "tradeId": "SEED-TSLA-00066",
        "symbol": "TSLA",
        "returnPct": 3.463,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 328.58,
          "confidence": 43,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-15T19:34:37.059Z"
      },
      {
        "tradeId": "SEED-WTI-00071",
        "symbol": "WTI",
        "returnPct": -2.424,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 65.18,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2025-12-22T19:34:37.064Z"
      },
      {
        "tradeId": "SEED-WTI-00072",
        "symbol": "WTI",
        "returnPct": -3.52,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 64.49,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2025-12-29T19:34:37.066Z"
      },
      {
        "tradeId": "SEED-WTI-00074",
        "symbol": "WTI",
        "returnPct": 2.906,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 63.66,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-01-12T19:34:37.068Z"
      },
      {
        "tradeId": "SEED-WTI-00076",
        "symbol": "WTI",
        "returnPct": -1.712,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 64.27,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-01-15T19:34:37.069Z"
      },
      {
        "tradeId": "SEED-WTI-00077",
        "symbol": "WTI",
        "returnPct": -2.992,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 63.17,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-01-17T19:34:37.070Z"
      },
      {
        "tradeId": "SEED-WTI-00080",
        "symbol": "WTI",
        "returnPct": -2.354,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 62.44,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-02-03T19:34:37.074Z"
      },
      {
        "tradeId": "SEED-WTI-00081",
        "symbol": "WTI",
        "returnPct": -2.739,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 60.97,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-02-13T19:34:37.075Z"
      },
      {
        "tradeId": "SEED-WTI-00082",
        "symbol": "WTI",
        "returnPct": -3.302,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 60.87,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-02-20T19:34:37.076Z"
      },
      {
        "tradeId": "SEED-WTI-00085",
        "symbol": "WTI",
        "returnPct": -3.33,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 58.55,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-03-15T19:34:37.080Z"
      },
      {
        "tradeId": "SEED-WTI-00086",
        "symbol": "WTI",
        "returnPct": 4.17,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 56.6,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-03-24T19:34:37.082Z"
      },
      {
        "tradeId": "SEED-WTI-00091",
        "symbol": "WTI",
        "returnPct": -4.894,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 64.77,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-08T19:34:37.087Z"
      },
      {
        "tradeId": "SEED-WTI-00098",
        "symbol": "WTI",
        "returnPct": 4.71,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 71.13,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-28T19:34:37.097Z"
      },
      {
        "tradeId": "SEED-WTI-00099",
        "symbol": "WTI",
        "returnPct": 8.593,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 74.48,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-30T19:34:37.098Z"
      },
      {
        "tradeId": "SEED-WTI-00100",
        "symbol": "WTI",
        "returnPct": 12.228,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 80.88,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-01T19:34:37.099Z"
      },
      {
        "tradeId": "SEED-WTI-00101",
        "symbol": "WTI",
        "returnPct": 4.275,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 90.77,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-02T19:34:37.100Z"
      },
      {
        "tradeId": "SEED-WTI-00102",
        "symbol": "WTI",
        "returnPct": -11.558,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 94.65,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-03T19:34:37.101Z"
      },
      {
        "tradeId": "SEED-WTI-00103",
        "symbol": "WTI",
        "returnPct": 3.691,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 83.71,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-04T19:34:37.102Z"
      },
      {
        "tradeId": "SEED-WTI-00104",
        "symbol": "WTI",
        "returnPct": 10.15,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 86.8,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-05T19:34:37.103Z"
      },
      {
        "tradeId": "SEED-WTI-00105",
        "symbol": "WTI",
        "returnPct": 3.002,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 95.61,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-06T19:34:37.104Z"
      },
      {
        "tradeId": "SEED-WTI-00106",
        "symbol": "WTI",
        "returnPct": -5.169,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 98.48,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-07T19:34:37.105Z"
      },
      {
        "tradeId": "SEED-WTI-00107",
        "symbol": "WTI",
        "returnPct": 2.805,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 93.39,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-08T19:34:37.106Z"
      },
      {
        "tradeId": "SEED-WTI-00108",
        "symbol": "WTI",
        "returnPct": 2.812,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 96.01,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-11T19:34:37.107Z"
      },
      {
        "tradeId": "SEED-WTI-00109",
        "symbol": "WTI",
        "returnPct": -9.503,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 98.71,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-12T19:34:37.109Z"
      },
      {
        "tradeId": "SEED-WTI-00139",
        "symbol": "WTI",
        "returnPct": -1.891,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 74.56,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-07-25T19:34:37.159Z"
      },
      {
        "tradeId": "SEED-WTI-00140",
        "symbol": "WTI",
        "returnPct": 8.271,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 73.15,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-07-27T19:34:37.162Z"
      },
      {
        "tradeId": "SEED-WTI-00141",
        "symbol": "WTI",
        "returnPct": 5.341,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 79.2,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-07-31T19:34:37.164Z"
      },
      {
        "tradeId": "SEED-WTI-00142",
        "symbol": "WTI",
        "returnPct": 3.128,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 83.43,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-08-02T19:34:37.165Z"
      },
      {
        "tradeId": "SEED-WTI-00143",
        "symbol": "WTI",
        "returnPct": 8.182,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 86.04,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-08-04T19:34:37.167Z"
      },
      {
        "tradeId": "SEED-WTI-00144",
        "symbol": "WTI",
        "returnPct": -9.486,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 93.08,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-08-06T19:34:37.168Z"
      },
      {
        "tradeId": "SEED-WTI-00145",
        "symbol": "WTI",
        "returnPct": -3.964,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 84.25,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-08-07T19:34:37.170Z"
      },
      {
        "tradeId": "SEED-WTI-00146",
        "symbol": "WTI",
        "returnPct": 6.39,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 80.91,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-08-08T19:34:37.171Z"
      },
      {
        "tradeId": "SEED-WTI-00148",
        "symbol": "WTI",
        "returnPct": -5.649,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1D",
          "entryPrice": 81.96,
          "confidence": 30,
          "score": 28,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-08-12T19:34:37.176Z"
      }
    ],
    "macd_cross@1h": [
      {
        "tradeId": "SEED-BTCUSD-00005",
        "symbol": "BTCUSD",
        "returnPct": -0.302,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1h",
          "entryPrice": 63689.061367716,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-04T19:34:37.000Z"
      },
      {
        "tradeId": "SEED-BTCUSD-00006",
        "symbol": "BTCUSD",
        "returnPct": -0.159,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1h",
          "entryPrice": 63487.72761826499,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-04-30T19:34:37.001Z"
      },
      {
        "tradeId": "SEED-BTCUSD-00007",
        "symbol": "BTCUSD",
        "returnPct": -0.492,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1h",
          "entryPrice": 63387.095783383236,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-05-24T19:34:37.002Z"
      },
      {
        "tradeId": "SEED-BTCUSD-00008",
        "symbol": "BTCUSD",
        "returnPct": -0.011,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "macd_cross@1h",
          "entryPrice": 63075.01363159537,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-17T19:34:37.003Z"
      }
    ],
    "sma_rsi@1h": [
      {
        "tradeId": "SEED-BTCUSD-00009",
        "symbol": "BTCUSD",
        "returnPct": 0.462,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1h",
          "entryPrice": 63068.05154462397,
          "confidence": 30,
          "score": 20,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-07-11T19:34:37.004Z"
      },
      {
        "tradeId": "SEED-BTCUSD-00010",
        "symbol": "BTCUSD",
        "returnPct": 1.13,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "sma_rsi@1h",
          "entryPrice": 63359.50975069107,
          "confidence": 30,
          "score": 20,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-08-04T19:34:37.005Z"
      }
    ],
    "bollinger_reversion@1D": [
      {
        "tradeId": "SEED-QQQ-00030",
        "symbol": "QQQ",
        "returnPct": -1.9,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 695.33,
          "confidence": 39,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-02T19:34:37.026Z"
      },
      {
        "tradeId": "SEED-QQQ-00031",
        "symbol": "QQQ",
        "returnPct": -2.037,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 675.49,
          "confidence": 39,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-04T19:34:37.027Z"
      },
      {
        "tradeId": "SEED-QQQ-00032",
        "symbol": "QQQ",
        "returnPct": 3.297,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 661.73,
          "confidence": 39,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-05T19:34:37.028Z"
      },
      {
        "tradeId": "SEED-AAPL-00034",
        "symbol": "AAPL",
        "returnPct": 3.136,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 275.15,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-13T19:34:37.029Z"
      },
      {
        "tradeId": "SEED-NVDA-00052",
        "symbol": "NVDA",
        "returnPct": 5.652,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 190.01,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-06T19:34:37.045Z"
      },
      {
        "tradeId": "SEED-TSLA-00064",
        "symbol": "TSLA",
        "returnPct": -2.083,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 319.69,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-01T19:34:37.057Z"
      },
      {
        "tradeId": "SEED-TSLA-00065",
        "symbol": "TSLA",
        "returnPct": -1.786,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 313.03,
          "confidence": 30,
          "score": 5,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-08-03T19:34:37.058Z"
      },
      {
        "tradeId": "SEED-WTI-00073",
        "symbol": "WTI",
        "returnPct": 2.877,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 62.22,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-01-01T19:34:37.067Z"
      },
      {
        "tradeId": "SEED-WTI-00078",
        "symbol": "WTI",
        "returnPct": -2.444,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 59.75,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-01-26T19:34:37.071Z"
      },
      {
        "tradeId": "SEED-WTI-00079",
        "symbol": "WTI",
        "returnPct": 7.12,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 58.29,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-01-31T19:34:37.073Z"
      },
      {
        "tradeId": "SEED-WTI-00083",
        "symbol": "WTI",
        "returnPct": -1.869,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 58.86,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-03-05T19:34:37.078Z"
      },
      {
        "tradeId": "SEED-WTI-00084",
        "symbol": "WTI",
        "returnPct": 4.942,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 55.44,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-03-12T19:34:37.079Z"
      },
      {
        "tradeId": "SEED-WTI-00135",
        "symbol": "WTI",
        "returnPct": 3.909,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 92.35,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-06-29T19:34:37.150Z"
      },
      {
        "tradeId": "SEED-WTI-00136",
        "symbol": "WTI",
        "returnPct": -6.491,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 79.8,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-07-14T19:34:37.152Z"
      },
      {
        "tradeId": "SEED-WTI-00137",
        "symbol": "WTI",
        "returnPct": -4.288,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 74.62,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-07-15T19:34:37.154Z"
      },
      {
        "tradeId": "SEED-WTI-00138",
        "symbol": "WTI",
        "returnPct": -2.352,
        "outcomeTag": "probe_loss",
        "snapshot": {
          "strategyKey": "bollinger_reversion@1D",
          "entryPrice": 71.42,
          "confidence": 36,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": null,
          "aiEngine": "rule"
        },
        "at": "2026-07-20T19:34:37.156Z"
      }
    ],
    "engulfing@1D": [
      {
        "tradeId": "SEED-AAPL-00035",
        "symbol": "AAPL",
        "returnPct": 4.841,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "engulfing@1D",
          "entryPrice": 294.38,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-17T19:34:37.030Z"
      },
      {
        "tradeId": "SEED-TSLA-00056",
        "symbol": "TSLA",
        "returnPct": 3.268,
        "outcomeTag": "probe_win",
        "snapshot": {
          "strategyKey": "engulfing@1D",
          "entryPrice": 411.84,
          "confidence": 45,
          "score": 55,
          "tier": "probe",
          "volatilityRegime": "normal",
          "aiEngine": "rule"
        },
        "at": "2026-07-16T19:34:37.049Z"
      }
    ]
  },
  "lessons": {
    "macd_cross@1D": [
      {
        "id": "macd_cross@1D::probe_loss::v1",
        "version": 1,
        "strategyKey": "macd_cross@1D",
        "failureMode": "probe_loss",
        "statement": "Negli ultimi 8 trade sonda di macd_cross@1D, 4 (50%) hanno chiuso in perdita (rendimento medio -6.21%) — coerente con l'assenza di un edge misurato: la sonda sta facendo il suo lavoro, non è un errore da correggere.",
        "sampleSize": 8,
        "occurrences": 4,
        "avgReturn": -6.211,
        "supportingTradeIds": [
          "SEED-WTI-00109",
          "SEED-WTI-00139",
          "SEED-WTI-00144",
          "SEED-WTI-00145"
        ],
        "createdAt": "2026-08-18T19:34:37.170Z",
        "supersedes": null,
        "active": true
      }
    ],
    "macd_cross@1h": [
      {
        "id": "macd_cross@1h::probe_loss::v1",
        "version": 1,
        "strategyKey": "macd_cross@1h",
        "failureMode": "probe_loss",
        "statement": "Negli ultimi 4 trade sonda di macd_cross@1h, 4 (100%) hanno chiuso in perdita (rendimento medio -0.24%) — coerente con l'assenza di un edge misurato: la sonda sta facendo il suo lavoro, non è un errore da correggere.",
        "sampleSize": 4,
        "occurrences": 4,
        "avgReturn": -0.241,
        "supportingTradeIds": [
          "SEED-BTCUSD-00005",
          "SEED-BTCUSD-00006",
          "SEED-BTCUSD-00007",
          "SEED-BTCUSD-00008"
        ],
        "createdAt": "2026-08-18T19:34:37.003Z",
        "supersedes": null,
        "active": true
      }
    ],
    "sma_rsi@1D": [
      {
        "id": "sma_rsi@1D::probe_loss::v1",
        "version": 1,
        "strategyKey": "sma_rsi@1D",
        "failureMode": "probe_loss",
        "statement": "Negli ultimi 8 trade sonda di sma_rsi@1D, 4 (50%) hanno chiuso in perdita (rendimento medio -6.18%) — coerente con l'assenza di un edge misurato: la sonda sta facendo il suo lavoro, non è un errore da correggere.",
        "sampleSize": 8,
        "occurrences": 4,
        "avgReturn": -6.182,
        "supportingTradeIds": [
          "SEED-WTI-00128",
          "SEED-WTI-00133",
          "SEED-WTI-00134",
          "SEED-WTI-00147"
        ],
        "createdAt": "2026-08-18T19:34:37.174Z",
        "supersedes": null,
        "active": true
      }
    ],
    "bollinger_reversion@1D": [
      {
        "id": "bollinger_reversion@1D::probe_loss::v1",
        "version": 1,
        "strategyKey": "bollinger_reversion@1D",
        "failureMode": "probe_loss",
        "statement": "Negli ultimi 8 trade sonda di bollinger_reversion@1D, 5 (63%) hanno chiuso in perdita (rendimento medio -3.49%) — coerente con l'assenza di un edge misurato: la sonda sta facendo il suo lavoro, non è un errore da correggere.",
        "sampleSize": 8,
        "occurrences": 5,
        "avgReturn": -3.489,
        "supportingTradeIds": [
          "SEED-WTI-00078",
          "SEED-WTI-00083",
          "SEED-WTI-00136",
          "SEED-WTI-00137",
          "SEED-WTI-00138"
        ],
        "createdAt": "2026-08-18T19:34:37.156Z",
        "supersedes": null,
        "active": true
      }
    ]
  }
};
