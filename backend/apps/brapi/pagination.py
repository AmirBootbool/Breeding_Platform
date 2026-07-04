from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class BrapiPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "pageSize"
    page_query_param = "page"

    def get_page_number(self, request, paginator):
        if self.page_query_param in request.query_params:
            val = request.query_params[self.page_query_param]
            try:
                # Page numbers in BrAPI are 0-indexed, so we add 1 to
                # match DRF's 1-indexed pages
                return int(val) + 1
            except (TypeError, ValueError):
                pass
        return 1

    def get_paginated_response(self, data):
        # BrAPI pages are 0-indexed, but DRF is 1-indexed.
        current_page = self.page.number - 1
        total_pages = self.page.paginator.num_pages
        total_count = self.page.paginator.count

        return Response(
            {
                "metadata": {
                    "pagination": {
                        "currentPage": current_page,
                        "pageSize": self.get_page_size(self.request),
                        "totalCount": total_count,
                        "totalPages": total_pages,
                    },
                    "status": [],
                    "datafiles": [],
                },
                "result": {"data": data},
            }
        )
