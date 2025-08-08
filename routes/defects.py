"""
瑕疵管理相關路由
"""
from flask import Blueprint, render_template, request, current_app, Response, jsonify
from flask_login import login_required
import json
from utils.api import call_road_defect_api
import requests

defects_bp = Blueprint('defects', __name__)


@defects_bp.route('/home')
@login_required
def home():
    """瑕疵列表頁面"""
    try:
        # 輸出請求參數以便調試
        print("Request args:", request.args)
        print("Defect type:", request.args.get('defect_type'))
        print("Road section:", request.args.get('road_section'))

        # 獲取搜尋參數
        params = {}

        # 處理多個瑕疵類型
        defect_types = request.args.getlist('defect_type')
        if defect_types:
            # 如果有多個瑕疵類型，需要分別查詢並合併結果
            all_defects = []
            for defect_type in defect_types:
                type_params = params.copy()
                if defect_type != 'all':
                    try:
                        type_params['defect_type'] = int(defect_type)
                    except ValueError:
                        current_app.logger.error(f'無效的瑕疵類型值: {defect_type}')
                        continue
                print(f"Searching for defect_type: {type_params.get('defect_type', 'all')}")

                # 處理多個嚴重程度
                severities = request.args.getlist('severity')
                if severities:
                    for severity in severities:
                        severity_params = type_params.copy()
                        if severity != 'all':
                            try:
                                severity_params['severity'] = int(severity)
                            except ValueError:
                                current_app.logger.error(f'無效的嚴重程度值: {severity}')
                                continue
                        print(f"Searching for severity: {severity_params.get('severity', 'all')}")

                        # 處理多個城市參數
                        cities = request.args.getlist('city')
                        if cities:
                            # 一次性獲取所有城市的數據
                            city_params = severity_params.copy()
                            if 'all' not in cities:
                                city_params['city'] = cities
                            print(f"Searching with params: {city_params}")
                            
                            # 調用 API 獲取數據
                            result = call_road_defect_api('road-defects', params=city_params)
                            if result.get('success') and result['data'].get('data'):
                                all_defects.extend(result['data']['data'])
                        else:
                            # 如果沒有選擇城市，直接使用當前參數進行搜索
                            result = call_road_defect_api('road-defects', params=severity_params)
                            if result.get('success') and result['data'].get('data'):
                                all_defects.extend(result['data']['data'])

            # 如果有數據，返回合併後的結果
            if all_defects:
                print(f"Found {len(all_defects)} defects in total")
                # 去除重複的瑕疵
                unique_defects = []
                seen_ids = set()
                for defect in all_defects:
                    if defect['id'] not in seen_ids:
                        seen_ids.add(defect['id'])
                        unique_defects.append(defect)
                print(f"After removing duplicates: {len(unique_defects)} defects")
                return render_template('defects/home.html',
                                       defects={'data': unique_defects},
                                       map_data=json.dumps(unique_defects))
            else:
                print("No defects found")
                return render_template('defects/home.html',
                                       error='沒有找到符合條件的瑕疵資料',
                                       defects={'data': []},
                                       map_data=json.dumps([]))
        else:
            # 如果沒有選擇城市，使用其他參數進行搜索
            if request.args.get('district'):
                params['district'] = request.args.get('district')

            if request.args.get('road_section'):
                params['road_section'] = request.args.get('road_section')
                road_to_filter = request.args.get('road_section')
            else:
                road_to_filter = None

            if request.args.get('start_time'):
                params['start_time'] = request.args.get('start_time')

            if request.args.get('end_time'):
                params['end_time'] = request.args.get('end_time')

            print(f"Searching with params (no city): {params}")
            # 從 API 獲取瑕疵列表
            api_result = call_road_defect_api('road-defects', params=params)
            print("API result (no city):", api_result)

            if api_result['success']:
                api_response = api_result['data']

                if not api_response.get('data'):
                    return render_template('defects/home.html',
                                           error='沒有找到符合條件的瑕疵資料',
                                           defects={'data': []},
                                           map_data=json.dumps([]))

                # 如果指定了道路，進行過濾
                if road_to_filter:
                    filtered_data = [
                        defect for defect in api_response.get('data', [])
                        if defect.get('road_section') == road_to_filter
                    ]
                    api_response['data'] = filtered_data

                # 準備地圖數據
                map_data = json.dumps(api_response.get('data', []))
                return render_template('defects/home.html',
                                       defects=api_response,
                                       map_data=map_data)
            else:
                # 處理 API 錯誤
                return render_template('defects/home.html',
                                       error=api_result['error'],
                                       defects={'data': []},
                                       map_data=json.dumps([]))

    except Exception as e:
        current_app.logger.error(f"未預期的錯誤: {str(e)}")
        return render_template('defects/home.html',
                               error=f'系統發生未預期的錯誤：{str(e)}',
                               defects={'data': []},
                               map_data=json.dumps([]))


@defects_bp.route('/proxy-image/<int:defect_id>')
def proxy_image(defect_id):
    """代理圖片請求到外部 API"""
    try:
        # 使用 call_road_defect_api 獲取圖片
        result = call_road_defect_api(f'road-defects/{defect_id}/image', stream=True)
        
        if result.get('success'):
            response = result['response']
            # 獲取內容類型
            content_type = response.headers.get('content-type', 'image/jpeg')
            
            # 返回圖片數據
            return Response(
                response.iter_content(chunk_size=8192),
                content_type=content_type
            )
        else:
            # 如果圖片不存在，返回 404
            return Response(status=404)

    except Exception as e:
        print(f"代理圖片請求時發生錯誤: {str(e)}")
        return Response(status=500)


@defects_bp.route('/api/locations/cities', methods=['GET'])
@login_required
def get_cities():
    """獲取所有唯一的城市列表"""
    try:
        # 調用API獲取所有瑕疵記錄
        api_result = call_road_defect_api('road-defects')
        print("API Response for cities:", api_result)  # 添加調試日誌

        if api_result.get('success'):  # 修改這裡，使用 'success' 而不是 'status'
            # 從所有記錄中提取唯一的城市
            cities = sorted(list(
                set(defect.get('city', '') for defect in api_result['data'].get('data', []) if defect.get('city'))))
            print("Extracted cities:", cities)  # 添加調試日誌
            return jsonify({
                'status': 'success',
                'data': cities
            })
        return jsonify({
            'status': 'error',
            'message': '無法獲取城市列表'
        }), 500
    except Exception as e:
        print(f"Error in get_cities: {str(e)}")  # 添加調試日誌
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@defects_bp.route('/api/locations/list', methods=['GET'])
@login_required
def get_location_list():
    """獲取所有的地理位置數據，包括城市、行政區和街道"""
    try:
        # 調用API獲取所有瑕疵記錄
        api_result = call_road_defect_api('road-defects')

        if not api_result.get('success'):
            return jsonify({
                'status': 'error',
                'message': '無法獲取地理位置數據'
            }), 500

        # 創建層級結構數據
        location_data = {}

        # 從所有記錄中提取並組織地理位置數據
        for defect in api_result['data'].get('data', []):
            city = defect.get('city')
            district = defect.get('district')
            road = defect.get('road_section')

            if not all([city, district, road]):
                continue

            # 初始化城市字典
            if city not in location_data:
                location_data[city] = {}

            # 初始化行政區列表
            if district not in location_data[city]:
                location_data[city][district] = []

            # 添加街道
            if road not in location_data[city][district]:
                location_data[city][district].append(road)

        # 對每個層級的數據進行排序
        sorted_data = {}
        for city in sorted(location_data.keys()):
            sorted_data[city] = {}
            for district in sorted(location_data[city].keys()):
                sorted_data[city][district] = sorted(location_data[city][district])

        return jsonify({
            'status': 'success',
            'data': sorted_data
        })

    except Exception as e:
        print(f"Error in get_location_list: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@defects_bp.route('/api/locations/districts', methods=['GET'])
@login_required
def get_districts():
    """獲取指定城市的所有唯一行政區列表"""
    try:
        city = request.args.get('city')
        if not city:
            return jsonify({
                'status': 'error',
                'message': '必須指定城市'
            }), 400

        # 調用API獲取所有瑕疵記錄
        api_result = call_road_defect_api('road-defects', params={'city': city})
        if api_result.get('success'):  # 修改這裡，使用 'success' 而不是 'status'
            # 從所有記錄中提取唯一的行政區
            districts = sorted(list(set(
                defect.get('district', '') for defect in api_result['data'].get('data', []) if defect.get('district'))))
            return jsonify({
                'status': 'success',
                'data': districts
            })
        return jsonify({
            'status': 'error',
            'message': '無法獲取行政區列表'
        }), 500
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@defects_bp.route('/api/locations/roads', methods=['GET'])
@login_required
def get_roads():
    """獲取指定城市和行政區的所有唯一街道列表"""
    try:
        city = request.args.get('city')
        district = request.args.get('district')
        if not city or not district:
            return jsonify({
                'status': 'error',
                'message': '必須指定城市和行政區'
            }), 400

        # 調用API獲取所有瑕疵記錄
        api_result = call_road_defect_api('road-defects', params={'city': city, 'district': district})
        if api_result.get('success'):  # 修改這裡，使用 'success' 而不是 'status'
            # 從所有記錄中提取唯一的街道
            roads = sorted(list(set(defect.get('road_section', '') for defect in api_result['data'].get('data', []) if
                                    defect.get('road_section'))))
            return jsonify({
                'status': 'success',
                'data': roads
            })
        return jsonify({
            'status': 'error',
            'message': '無法獲取街道列表'
        }), 500
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@defects_bp.route('/api/road-defects/stats', methods=['GET'])
@login_required
def get_stats():
    """獲取瑕疵統計數據"""
    try:
        # 從請求中獲取參數
        params = {}
        if request.args.getlist('city[]'):
            params['city'] = request.args.getlist('city[]')
        if request.args.getlist('district[]'):
            params['district'] = request.args.getlist('district[]')
        if request.args.getlist('road_section[]'):
            params['road_section'] = request.args.getlist('road_section[]')
        if request.args.getlist('defect_type[]'):
            params['defect_type'] = request.args.getlist('defect_type[]')
        if request.args.getlist('severity[]'):
            params['severity'] = request.args.getlist('severity[]')
        if request.args.get('start_time'):
            params['start_time'] = request.args.get('start_time')
        if request.args.get('end_time'):
            params['end_time'] = request.args.get('end_time')

        # 調用外部 API
        api_result = call_road_defect_api('road-defects/stats', params=params)
        return jsonify(api_result)
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@defects_bp.route('/api/road-defects/trends', methods=['GET'])
@login_required
def get_trends():
    """獲取瑕疵趨勢數據"""
    try:
        params = {}
        if request.args.getlist('city[]'):
            params['city'] = request.args.getlist('city[]')
        if request.args.getlist('district[]'):
            params['district'] = request.args.getlist('district[]')
        if request.args.getlist('road_section[]'):
            params['road_section'] = request.args.getlist('road_section[]')
        if request.args.getlist('defect_type[]'):
            params['defect_type'] = request.args.getlist('defect_type[]')
        if request.args.getlist('severity[]'):
            params['severity'] = request.args.getlist('severity[]')
        if request.args.get('start_time'):
            params['start_time'] = request.args.get('start_time')
        if request.args.get('end_time'):
            params['end_time'] = request.args.get('end_time')

        api_result = call_road_defect_api('road-defects/trends', params=params)
        return jsonify(api_result)
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@defects_bp.route('/api/road-defects/distribution', methods=['GET'])
@login_required
def get_distribution():
    """獲取瑕疵地理分布統計"""
    try:
        params = {}
        if request.args.getlist('city[]'):
            params['city'] = request.args.getlist('city[]')
        if request.args.getlist('district[]'):
            params['district'] = request.args.getlist('district[]')
        if request.args.getlist('road_section[]'):
            params['road_section'] = request.args.getlist('road_section[]')
        if request.args.getlist('defect_type[]'):
            params['defect_type'] = request.args.getlist('defect_type[]')
        if request.args.getlist('severity[]'):
            params['severity'] = request.args.getlist('severity[]')
        if request.args.get('start_time'):
            params['start_time'] = request.args.get('start_time')
        if request.args.get('end_time'):
            params['end_time'] = request.args.get('end_time')

        api_result = call_road_defect_api('road-defects/distribution', params=params)
        return jsonify(api_result)
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@defects_bp.route('/api/road-defects/road-analysis', methods=['GET'])
@login_required
def get_road_analysis():
    """獲取道路瑕疵分析"""
    try:
        params = {}
        if request.args.getlist('city[]'):
            params['city'] = request.args.getlist('city[]')
        if request.args.getlist('district[]'):
            params['district'] = request.args.getlist('district[]')
        if request.args.getlist('road_section[]'):
            params['road_section'] = request.args.getlist('road_section[]')
        if request.args.getlist('defect_type[]'):
            params['defect_type'] = request.args.getlist('defect_type[]')
        if request.args.getlist('severity[]'):
            params['severity'] = request.args.getlist('severity[]')
        if request.args.get('start_time'):
            params['start_time'] = request.args.get('start_time')
        if request.args.get('end_time'):
            params['end_time'] = request.args.get('end_time')

        api_result = call_road_defect_api('road-defects/road-analysis', params=params)
        return jsonify(api_result)
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@defects_bp.route('/api/road-defects/list', methods=['GET'])
@login_required
def get_defect_list():
    """獲取瑕疵列表數據"""
    try:
        # 從請求中獲取參數
        params = {}
        if request.args.getlist('city[]'):
            params['city'] = request.args.getlist('city[]')
        if request.args.getlist('district[]'):
            params['district'] = request.args.getlist('district[]')
        if request.args.getlist('road_section[]'):
            params['road_section'] = request.args.getlist('road_section[]')
        if request.args.getlist('defect_type[]'):
            params['defect_type'] = request.args.getlist('defect_type[]')
        if request.args.getlist('severity[]'):
            params['severity'] = request.args.getlist('severity[]')
        if request.args.get('start_time'):
            params['start_time'] = request.args.get('start_time')
        if request.args.get('end_time'):
            params['end_time'] = request.args.get('end_time')

        # 調用外部 API
        api_result = call_road_defect_api('road-defects', params=params)
        
        if api_result.get('success'):
            return jsonify({
                'status': 'success',
                'data': {
                    'defects': api_result['data'].get('data', [])
                }
            })
        else:
            return jsonify({
                'status': 'error',
                'message': '無法獲取瑕疵列表數據'
            }), 500
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
